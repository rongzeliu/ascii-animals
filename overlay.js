import { app, BrowserWindow, screen, Tray, Menu, nativeImage, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

let win;
let settingsWin;
let tray;
let server;
let clickMonitor;
let latestState = null;
let interactionEnabled = true;

function startGlobalClickMonitor() {
  if (process.platform !== 'darwin') return;
  try {
    if (app.isPackaged) {
      const binPath = path.join(process.resourcesPath, 'click-monitor');
      clickMonitor = spawn(binPath, [], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } else {
      const localBin = path.join(import.meta.dirname, 'build/click-monitor');
      const swiftScript = path.join(import.meta.dirname, 'scripts/click-monitor.swift');
      if (fs.existsSync(localBin)) {
        clickMonitor = spawn(localBin, [], {
          stdio: ['ignore', 'pipe', 'ignore'],
        });
      } else {
        clickMonitor = spawn('swift', [swiftScript], {
          stdio: ['ignore', 'pipe', 'ignore'],
        });
      }
    }
    let buffer = '';
    clickMonitor.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!interactionEnabled) continue;
        const [sx, sy] = line.trim().split(',').map(Number);
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
        if (!win || win.isDestroyed() || !win.isVisible()) continue;
        if (settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible()) {
          const sb = settingsWin.getBounds();
          if (sx >= sb.x && sx <= sb.x + sb.width && sy >= sb.y && sy <= sb.y + sb.height) {
            continue;
          }
        }
        const wb = win.getBounds();
        win.webContents.send('overlay:startle', {
          x: sx - wb.x,
          y: sy - wb.y,
        });
      }
    });
    clickMonitor.on('error', () => {
      // Ignore if click-monitor or swift is unavailable.
    });
  } catch {
    // Ignore spawn errors.
  }
}

/** Generate a clean 16x16 RGBA butterfly/sparkle template PNG for the macOS menu bar. */
function createTrayIcon() {
  const w = 16;
  const h = 16;
  const bitmap = [
    '................',
    '..###......###..',
    '.#####....#####.',
    '.######..######.',
    '.##############.',
    '..############..',
    '...##########...',
    '.....######.....',
    '...##########...',
    '..#####..#####..',
    '..####....####..',
    '...##......##...',
    '................',
    '................',
    '................',
    '................',
  ];

  // Raw scanlines: each row starts with filter byte 0, followed by RGBA pixels
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < w; x++) {
      const on = bitmap[y][x] === '#';
      const idx = rowStart + 1 + x * 4;
      raw[idx] = 0;
      raw[idx + 1] = 0;
      raw[idx + 2] = 0;
      raw[idx + 3] = on ? 255 : 0;
    }
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const idat = zlib.deflateSync(raw);
  const png = Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  const img = nativeImage.createFromBuffer(png);
  img.setTemplateImage(true);
  return img;
}

function toggleSettingsWindow() {
  if (!settingsWin || settingsWin.isDestroyed()) return;
  if (settingsWin.isVisible()) {
    settingsWin.hide();
    return;
  }
  const trayBounds = tray.getBounds();
  const winBounds = settingsWin.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const workArea = display.workArea;

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  let y = Math.round(trayBounds.y + trayBounds.height + 6);

  x = Math.max(workArea.x + 8, Math.min(x, workArea.x + workArea.width - winBounds.width - 8));
  y = Math.max(workArea.y + 4, Math.min(y, workArea.y + workArea.height - winBounds.height - 8));

  settingsWin.setPosition(x, y, false);
  settingsWin.show();
  settingsWin.focus();
}

app.whenReady().then(async () => {
  app.dock?.hide();

  const preloadPath = path.join(import.meta.dirname, 'preload.cjs');

  let baseUrl = '';
  if (!app.isPackaged) {
    const { createServer } = await import('vite');
    server = await createServer({
      root: import.meta.dirname,
      server: {
        port: 5173,
        strictPort: false,
      },
    });
    await server.listen();
    baseUrl = (server.resolvedUrls?.local[0] || `http://localhost:${server.config.server.port}`).replace(/\/$/, '');
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      preload: preloadPath,
    },
  });

  win.setIgnoreMouseEvents(true, { forward: true });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  settingsWin = new BrowserWindow({
    width: 320,
    height: 480,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      preload: preloadPath,
    },
  });

  settingsWin.setAlwaysOnTop(true, 'pop-up-menu');
  settingsWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  settingsWin.on('blur', () => {
    settingsWin?.hide();
  });

  tray = new Tray(createTrayIcon());
  tray.setToolTip('ASCII Animals Overlay');
  tray.on('click', () => {
    toggleSettingsWindow();
  });
  tray.on('right-click', () => {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Adjust Art Settings…', click: () => toggleSettingsWindow() },
      {
        label: 'Click Reactions',
        type: 'checkbox',
        checked: interactionEnabled,
        click: (item) => {
          interactionEnabled = item.checked;
          if (settingsWin && !settingsWin.isDestroyed()) {
            settingsWin.webContents.send('overlay:interaction', interactionEnabled);
          }
        },
      },
      { type: 'separator' },
      { label: 'Quit ASCII Animals', click: () => app.quit() },
    ]);
    tray.popUpContextMenu(contextMenu);
  });

  ipcMain.on('overlay:state', (_e, state) => {
    latestState = state;
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('overlay:state', state);
    }
  });

  ipcMain.on('overlay:request-state', () => {
    if (latestState && settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('overlay:state', latestState);
    } else if (win && !win.isDestroyed()) {
      win.webContents.send('overlay:request-state');
    }
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('overlay:interaction', interactionEnabled);
    }
  });

  ipcMain.on('overlay:set-interaction', (_e, enabled) => {
    interactionEnabled = Boolean(enabled);
  });

  ipcMain.on('overlay:set-animal', (_e, animal) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('overlay:set-animal', animal);
    }
  });

  ipcMain.on('overlay:set-knob', (_e, payload) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('overlay:set-knob', payload);
    }
  });

  ipcMain.on('overlay:reset-animal', () => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('overlay:reset-animal');
    }
  });

  ipcMain.on('overlay:set-visible', (_e, visible) => {
    if (!win || win.isDestroyed()) return;
    if (visible) {
      win.showInactive();
    } else {
      win.hide();
    }
  });

  ipcMain.on('overlay:quit', () => {
    app.quit();
  });

  if (app.isPackaged) {
    await Promise.all([
      win.loadFile(path.join(import.meta.dirname, 'dist/index.html')),
      settingsWin.loadFile(path.join(import.meta.dirname, 'dist/settings.html')),
    ]);
  } else {
    await Promise.all([
      win.loadURL(`${baseUrl}/index.html`),
      settingsWin.loadURL(`${baseUrl}/settings.html`),
    ]);
  }

  startGlobalClickMonitor();
});

app.on('will-quit', async () => {
  if (clickMonitor && !clickMonitor.killed) {
    clickMonitor.kill();
  }
  if (server) {
    await server.close();
  }
});
