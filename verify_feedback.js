const { _electron: electron } = require('@playwright/test');
const path = require('path');

(async () => {
  console.log('Starting verification script...');
  const appPath = path.join(__dirname, 'dist/main.js');

  const electronApp = await electron.launch({
    args: [appPath],
    env: {
      ...process.env,
      NODE_ENV: 'production'
    }
  });

  const window = await electronApp.firstWindow();
  console.log('Window loaded');

  await window.waitForTimeout(5000);

  const branchNames = await window.locator('span.truncate').allInnerTexts();

  // Current branch is the first one (usually).
  const currentBranch = branchNames[0];
  console.log(`Right clicking on CURRENT branch: ${currentBranch}`);
  const currentSpan = window.locator(`span:text-is("${currentBranch}")`).last();
  await currentSpan.click({ button: 'right', force: true });
  await window.waitForTimeout(1000);
  let menuTexts = await window.locator('.fixed.z-50').allInnerTexts();
  console.log('Current branch context menu content:', menuTexts);

  if (menuTexts.length === 0 || !menuTexts[0].includes('Pull latest changes')) {
    console.log('SUCCESS: Context menu NOT shown (or no Pull) for CURRENT branch as requested by PR feedback');
  } else {
    console.log('FAILURE: Context menu SHOWN for CURRENT branch');
  }

  // Find another branch
  const otherBranch = branchNames.find(name => name !== currentBranch && name !== 'Henrik Andersson'); // Avoid author names if they got mixed in
  if (otherBranch) {
    console.log(`Right clicking on OTHER branch: ${otherBranch}`);
    const otherSpan = window.locator(`span:text-is("${otherBranch}")`).last();
    await otherSpan.click({ button: 'right', force: true });
    await window.waitForTimeout(2000);
    await window.screenshot({ path: '/home/jules/verification/other_branch_menu.png' });
    menuTexts = await window.locator('.fixed.z-50').allInnerTexts();
    console.log('Other branch context menu content:', menuTexts);

    if (menuTexts.some(t => t.includes('Pull latest changes'))) {
      console.log('SUCCESS: Pull latest changes option found for OTHER branch');
    } else {
      console.log('FAILURE: Pull latest changes option NOT found for OTHER branch');
    }
  } else {
      console.log('No other branch found to test');
  }

  await electronApp.close();
})();
