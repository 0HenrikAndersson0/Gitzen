import { app, BrowserWindow, ipcMain, dialog, Menu, shell, MenuItemConstructorOptions } from 'electron';
import * as path from 'path';
import * as recentReposService from './recentReposService';
import * as settingsService from './settingsService';
import * as updateService from './updateService';
import * as watcherService from './watcherService';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Use git command implementation (native git commands via child_process)
const gitService = require('./gitService');

function createWindow() {
  // Create the browser window
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Gitzen',
    icon: path.join(__dirname, '..', 'icon.png'),
    autoHideMenuBar: false, // We are setting a custom menu, so we don't need to auto-hide the default one
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Custom Menu
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] as MenuItemConstructorOptions[] : []),
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
          { type: 'separator' },
          {
            label: 'Speech',
            submenu: [
              { role: 'startSpeaking' },
              { role: 'stopSpeaking' }
            ]
          }
        ] : [
          { role: 'delete' },
          { type: 'separator' },
          { role: 'selectAll' }
        ])
      ] as MenuItemConstructorOptions[]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ] as MenuItemConstructorOptions[]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) {
              win.webContents.send('menu:show-shortcuts');
            }
          }
        },
        {
          label: 'Documentation',
          click: async () => {
            await shell.openExternal('https://gitzen-web.henrikandersson84.workers.dev');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  }
}

// Initialize git service
gitService.initializeGitService();

// Initialize recent repos service
recentReposService.setUserDataPath(app.getPath('userData'));

// Initialize settings service
settingsService.setUserDataPath(app.getPath('userData'));

// IPC handlers
ipcMain.handle('git:clone', async (_, url, localPath) => {
  const result = await gitService.cloneRepository(url, localPath);
  if (result.success) {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      watcherService.watchRepo(localPath, win);
    }
  }
  return result;
});

ipcMain.handle('git:open', async (_, repoPath) => {
  const result = await gitService.openRepository(repoPath);
  if (result.success) {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      watcherService.watchRepo(repoPath, win);
    }
  }
  return result;
});

ipcMain.handle('git:status', async () => {
  return await gitService.getStatus();
});

ipcMain.handle('git:stage', async (_, files) => {
  return await gitService.stageFiles(files);
});

ipcMain.handle('git:unstage', async (_, files) => {
  return await gitService.unstageFiles(files);
});

ipcMain.handle('git:stageAll', async () => {
  return await gitService.stageAll();
});

ipcMain.handle('git:unstageAll', async () => {
  return await gitService.unstageAll();
});

ipcMain.handle('git:commit', async (_, message, amend) => {
  return await gitService.commit(message, amend);
});

ipcMain.handle('git:undoCommit', async () => {
  return await gitService.undoLastCommit();
});

ipcMain.handle('git:push', async (_, remote, branch, force, overwrite) => {
  return await gitService.push(remote, branch, force, overwrite);
});

ipcMain.handle('git:pull', async (_, remote, branch, targetBranch) => {
  return await gitService.pull(remote, branch, targetBranch);
});

ipcMain.handle('git:addRemote', async (_, name, url) => {
  return await gitService.addRemote(name, url);
});

ipcMain.handle('git:createGitHubRepo', async (_, token, name, isPrivate, description) => {
  return await gitService.createGitHubRepo(token, name, isPrivate, description);
});

ipcMain.handle('git:getBranchStatus', async () => {
  return await gitService.getBranchStatus();
});

ipcMain.handle('git:getCurrentBranch', async () => {
  return await gitService.getCurrentBranch();
});

ipcMain.handle('git:getHistory', async (_, maxCount) => {
  return await gitService.getHistory(maxCount);
});

ipcMain.handle('git:getStashes', async () => {
  return await gitService.getStashes();
});

ipcMain.handle('git:createStash', async () => {
  return await gitService.createStash();
});

ipcMain.handle('git:applyStash', async (_, name) => {
  return await gitService.applyStash(name);
});

ipcMain.handle('git:deleteStash', async (_, name) => {
  return await gitService.deleteStash(name);
});

ipcMain.handle('git:getBranchesDetailed', async () => {
  return await gitService.getBranchesDetailed();
});

ipcMain.handle('git:fetch', async (_, remote) => {
  return await gitService.fetchRemote(remote);
});

ipcMain.handle('git:fetchAll', async () => {
  return await gitService.fetchAllRemotes();
});

ipcMain.handle('git:getBranches', async () => {
  return await gitService.getBranches();
});

ipcMain.handle('git:createBranch', async (_, name, checkout) => {
  return await gitService.createBranch(name, checkout);
});

ipcMain.handle('git:checkoutBranch', async (_, name) => {
  return await gitService.checkoutBranch(name);
});

ipcMain.handle('git:mergeBranchToCurrent', async (_, branchToMerge) => {
  return await gitService.mergeBranchToCurrent(branchToMerge);
});

ipcMain.handle('git:getRepoPath', () => {
  return gitService.getRepoPath();
});

ipcMain.handle('git:getRepoName', async () => {
  return await gitService.getRepoName();
});

ipcMain.handle('git:getFilesChurn', async (_, limit) => {
  return await gitService.getFilesChurn(limit);
});

ipcMain.handle('git:getCommitActivity', async () => {
  return await gitService.getCommitActivity();
});

ipcMain.handle('git:getTopContributors', async (_, limit) => {
  return await gitService.getTopContributors(limit);
});

ipcMain.handle('git:getCodebaseGrowth', async () => {
  return await gitService.getCodebaseGrowth();
});

ipcMain.handle('git:getFileTypeDistribution', async () => {
  return await gitService.getFileTypeDistribution();
});

ipcMain.handle('git:getRemoteUrl', async (_, remote) => {
  return await gitService.getRemoteUrl(remote);
});

ipcMain.handle('git:setRemoteUrl', async (_, remote, url) => {
  return await gitService.setRemoteUrl(remote, url);
});

ipcMain.handle('git:getRemoteBranches', async () => {
  return await gitService.getRemoteBranches();
});

ipcMain.handle('git:getTags', async () => {
  return await gitService.getTags();
});

ipcMain.handle('git:getCommitDiff', async (_, commitHash) => {
  return await gitService.getCommitDiff(commitHash);
});

ipcMain.handle('git:getFileDiff', async (_, filePath, staged) => {
  return await gitService.getFileDiff(filePath, staged);
});

ipcMain.handle('git:getFileBlame', async (_, filePath, commitHash) => {
  return await gitService.getFileBlame(filePath, commitHash);
});

ipcMain.handle('git:deleteBranch', async (_, branchName, force) => {
  return await gitService.deleteBranch(branchName, force);
});

ipcMain.handle('git:deleteRemoteBranch', async (_, remoteBranchName) => {
  return await gitService.deleteRemoteBranch(remoteBranchName);
});

ipcMain.handle('git:deleteTag', async (_, tagName) => {
  return await gitService.deleteTag(tagName);
});

ipcMain.handle('git:createTag', async (_, name, commitHash) => {
  return await gitService.createTag(name, commitHash);
});

ipcMain.handle('git:pushTag', async (_, tagName, remote) => {
  return await gitService.pushTag(tagName, remote);
});

ipcMain.handle('git:getRemoteTags', async (_, remote) => {
  return await gitService.getRemoteTags(remote);
});

ipcMain.handle('git:revertFileChanges', async (_, filePath) => {
  return await gitService.revertFileChanges(filePath);
});

ipcMain.handle('git:applyPatch', async (_, patch, options) => {
  return await gitService.applyPatch(patch, options);
});

ipcMain.handle('git:deleteFile', async (_, filePath) => {
  return await gitService.deleteFile(filePath);
});

ipcMain.handle('git:getTagsForCommit', async (_, commitHash) => {
  return await gitService.getTagsForCommit(commitHash);
});

ipcMain.handle('git:hasUnpushedCommits', async () => {
  return await gitService.hasUnpushedCommits();
});

ipcMain.handle('git:testGitCredentials', async (_, remoteUrl) => {
  return await gitService.testGitCredentials(remoteUrl);
});

ipcMain.handle('git:getGitUserConfig', async () => {
  return await gitService.getGitUserConfig();
});

ipcMain.handle('git:setGitUserConfig', async (_, name, email, isGlobal) => {
  return await gitService.setGitUserConfig(name, email, isGlobal);
});

ipcMain.handle('git:getConflictedFiles', async () => {
  return await gitService.getConflictedFiles();
});

ipcMain.handle('git:resolveConflict', async (_, filePath, decision) => {
  return await gitService.resolveConflict(filePath, decision);
});

ipcMain.handle('git:abortMerge', async () => {
  return await gitService.abortMerge();
});

ipcMain.handle('git:openFileInMergeTool', async (_, filePath) => {
  return await gitService.openFileInMergeTool(filePath);
});

ipcMain.handle('git:rebaseBranch', async (_, branch) => {
  return await gitService.rebaseBranch(branch);
});

ipcMain.handle('git:abortRebase', async () => {
  return await gitService.abortRebase();
});

ipcMain.handle('git:continueRebase', async () => {
  return await gitService.continueRebase();
});

ipcMain.handle('git:getRebaseStatus', async () => {
  return await gitService.getRebaseStatus();
});

ipcMain.handle('git:revertCommit', async (_, commitHash) => {
  return await gitService.revertCommit(commitHash);
});

ipcMain.handle('git:resetCommits', async (_, commitHash, mode) => {
  return await gitService.resetCommits(commitHash, mode);
});

ipcMain.handle('git:getRevertStatus', async () => {
  return await gitService.getRevertStatus();
});

ipcMain.handle('git:abortRevert', async () => {
  return await gitService.abortRevert();
});

ipcMain.handle('git:continueRevert', async () => {
  return await gitService.continueRevert();
});

ipcMain.handle('git:cherryPick', async (_, commitHash) => {
  return await gitService.cherryPick(commitHash);
});

ipcMain.handle('git:abortCherryPick', async () => {
  return await gitService.abortCherryPick();
});

ipcMain.handle('git:continueCherryPick', async () => {
  return await gitService.continueCherryPick();
});

ipcMain.handle('git:skipCherryPick', async () => {
  return await gitService.skipCherryPick();
});

ipcMain.handle('git:getCherryPickStatus', async () => {
  return await gitService.getCherryPickStatus();
});

ipcMain.handle('git:getCommitsForInteractiveRebase', async (_, targetBranch) => {
  return await gitService.getCommitsForInteractiveRebase(targetBranch);
});

ipcMain.handle('git:performInteractiveRebase', async (_, targetBranch, todoLines) => {
  return await gitService.performInteractiveRebase(targetBranch, todoLines);
});

ipcMain.handle('git:cancelOperation', () => {
  return gitService.cancelCurrentOperation();
});

// Update handlers
ipcMain.handle('update:check', async () => {
  return await updateService.checkForUpdates();
});

ipcMain.handle('app:openExternal', async (_, url) => {
  await shell.openExternal(url);
  return { success: true };
});

// Dialog handlers
ipcMain.handle('dialog:showOpenDialog', async (_, options?: { properties?: string[]; title?: string }) => {
  const dialogOptions: Electron.OpenDialogOptions = {
    properties: options?.properties as Electron.OpenDialogOptions['properties'] || ['openDirectory'],
    title: options?.title || 'Select Git Repository Folder',
  };

  // If selecting a file (for merge tool), add file filters
  if (options?.properties?.includes('openFile')) {
    dialogOptions.properties = ['openFile'];
    dialogOptions.filters = [
      { name: 'Executables', extensions: ['exe', 'app', ''] }, // Empty string allows all files on Linux
      { name: 'All Files', extensions: ['*'] },
    ];
  }

  const result = await dialog.showOpenDialog(dialogOptions);

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false };
  }

  return { success: true, path: result.filePaths[0] };
});

// Recent repos handlers
ipcMain.handle('repos:getRecent', () => {
  try {
    const repos = recentReposService.getRecentRepos();
    return { success: true, repos };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
});

ipcMain.handle('repos:addRecent', (_, repoPath) => {
  try {
    recentReposService.addRecentRepo(repoPath);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
});

ipcMain.handle('repos:removeRecent', (_, repoPath) => {
  try {
    recentReposService.removeRecentRepo(repoPath);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
});

// Settings handlers
ipcMain.handle('settings:getMergeToolPath', () => {
  try {
    const mergeToolPath = settingsService.getMergeToolPath();
    return { success: true, mergeToolPath };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
});

ipcMain.handle('settings:setMergeToolPath', (_, mergeToolPath: string) => {
  try {
    settingsService.setMergeToolPath(mergeToolPath);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
});

ipcMain.handle('settings:getMaxCommits', () => {
  try {
    const maxCommits = settingsService.getMaxCommits();
    return { success: true, maxCommits };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
});

ipcMain.handle('settings:setMaxCommits', (_, maxCommits: number) => {
  try {
    settingsService.setMaxCommits(maxCommits);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
});

ipcMain.handle('settings:getTheme', () => {
  try {
    const theme = settingsService.getTheme();
    return { success: true, theme };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
});

ipcMain.handle('settings:setTheme', (_, theme: string) => {
  try {
    settingsService.setTheme(theme);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  // Check for updates after a short delay
  setTimeout(async () => {
    const updateInfo = await updateService.checkForUpdates();
    if (updateInfo) {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].webContents.send('app:update-available', updateInfo);
      }
    }
  }, 5000);

  app.on('activate', () => {
    // On macOS, re-create a window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

