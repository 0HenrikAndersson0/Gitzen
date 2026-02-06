import { app, BrowserWindow, ipcMain, dialog, Menu, Shell } from 'electron';
import * as path from 'path';
import * as recentReposService from './recentReposService';
import * as settingsService from './settingsService';

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
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: async () => {
            const { shell } = require('electron');
            const helpPath = path.join(app.getAppPath(), 'HELP.md');
            await shell.openPath(helpPath);
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
ipcMain.handle('git:clone', async (_, url, localPath, credentials) => {
  return await gitService.cloneRepository(url, localPath, credentials);
});

ipcMain.handle('git:open', async (_, repoPath) => {
  return await gitService.openRepository(repoPath);
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

ipcMain.handle('git:commit', async (_, message) => {
  return await gitService.commit(message);
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

ipcMain.handle('git:saveCredentials', async (_, remoteUrl, username, password) => {
  return await gitService.saveCredentials(remoteUrl, username, password);
});

ipcMain.handle('git:hasCredentials', async (_, remoteUrl) => {
  return await gitService.hasCredentials(remoteUrl);
});

ipcMain.handle('git:validateExistingCredentials', async (_, remoteUrl) => {
  return await gitService.validateExistingCredentials(remoteUrl);
});

ipcMain.handle('git:deleteCredentials', async (_, remoteUrl) => {
  return await gitService.deleteCredentials(remoteUrl);
});

ipcMain.handle('git:listCredentials', async () => {
  return await gitService.listCredentials();
});

ipcMain.handle('git:getRepoPath', () => {
  return gitService.getRepoPath();
});

ipcMain.handle('git:getRepoName', async () => {
  return await gitService.getRepoName();
});

ipcMain.handle('git:getRemoteUrl', async (_, remote) => {
  return await gitService.getRemoteUrl(remote);
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

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

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

