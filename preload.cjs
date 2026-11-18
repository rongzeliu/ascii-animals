const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  sendState: (state) => ipcRenderer.send('overlay:state', state),
  onState: (cb) => {
    const listener = (_e, state) => cb(state);
    ipcRenderer.on('overlay:state', listener);
    return () => ipcRenderer.removeListener('overlay:state', listener);
  },
  requestState: () => ipcRenderer.send('overlay:request-state'),
  onRequestState: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('overlay:request-state', listener);
    return () => ipcRenderer.removeListener('overlay:request-state', listener);
  },
  setAnimal: (animal) => ipcRenderer.send('overlay:set-animal', animal),
  onSetAnimal: (cb) => {
    const listener = (_e, animal) => cb(animal);
    ipcRenderer.on('overlay:set-animal', listener);
    return () => ipcRenderer.removeListener('overlay:set-animal', listener);
  },
  setKnob: (key, value) => ipcRenderer.send('overlay:set-knob', { key, value }),
  onSetKnob: (cb) => {
    const listener = (_e, payload) => cb(payload.key, payload.value);
    ipcRenderer.on('overlay:set-knob', listener);
    return () => ipcRenderer.removeListener('overlay:set-knob', listener);
  },
  resetAnimal: () => ipcRenderer.send('overlay:reset-animal'),
  onResetAnimal: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('overlay:reset-animal', listener);
    return () => ipcRenderer.removeListener('overlay:reset-animal', listener);
  },
  setVisible: (visible) => ipcRenderer.send('overlay:set-visible', visible),
  setInteraction: (enabled) => ipcRenderer.send('overlay:set-interaction', enabled),
  onInteraction: (cb) => {
    const listener = (_e, enabled) => cb(enabled);
    ipcRenderer.on('overlay:interaction', listener);
    return () => ipcRenderer.removeListener('overlay:interaction', listener);
  },
  onStartle: (cb) => {
    const listener = (_e, pos) => cb(pos.x, pos.y);
    ipcRenderer.on('overlay:startle', listener);
    return () => ipcRenderer.removeListener('overlay:startle', listener);
  },
  quit: () => ipcRenderer.send('overlay:quit'),
});
