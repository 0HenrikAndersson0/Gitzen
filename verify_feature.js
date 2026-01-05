const { _electron: electron } = require('playwright');
const assert = require('assert');

(async () => {
  const electronApp = await electron.launch({ args: ['dist/main.js'] });
  const window = await electronApp.firstWindow();
  await window.waitForSelector('text=Open Repository');
  await window.screenshot({ path: '/home/jules/verification/verification.png' });
  await electronApp.close();
})();
