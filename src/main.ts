import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as recentReposService from './recentReposService';

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
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

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

ipcMain.handle('git:push', async (_, remote, branch) => {
  return await gitService.push(remote, branch);
});

ipcMain.handle('git:pull', async (_, remote, branch) => {
  return await gitService.pull(remote, branch);
});

ipcMain.handle('git:getCurrentBranch', async () => {
  return await gitService.getCurrentBranch();
});

ipcMain.handle('git:getHistory', async (_, maxCount) => {
  return await gitService.getHistory(maxCount);
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

ipcMain.handle('git:deleteBranch', async (_, branchName, force) => {
  return await gitService.deleteBranch(branchName, force);
});

ipcMain.handle('git:deleteTag', async (_, tagName) => {
  return await gitService.deleteTag(tagName);
});

ipcMain.handle('git:getTagsForCommit', async (_, commitHash) => {
  return await gitService.getTagsForCommit(commitHash);
});

ipcMain.handle('git:testGitCredentials', async (_, remoteUrl) => {
  return await gitService.testGitCredentials(remoteUrl);
});

// Dialog handlers
ipcMain.handle('dialog:showOpenDialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Git Repository Folder',
  });
  
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

