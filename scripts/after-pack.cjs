const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const helperPath = path.join(appPath, 'Contents', 'Resources', 'click-monitor');

  if (fs.existsSync(helperPath)) {
    execFileSync('codesign', ['--force', '--sign', '-', helperPath], { stdio: 'inherit' });
  }

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
};
