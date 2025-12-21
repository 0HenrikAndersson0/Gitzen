// Preload script runs in a context that has access to both
// the DOM and Node.js APIs, but cannot directly access the main process
// This is a security best practice in Electron

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the APIs you need. This is where you can add custom APIs
contextBridge.exposeInMainWorld('electronAPI', {
  gitClone: (url, path, credentials) => ipcRenderer.invoke('git:clone', url, path, credentials),
  gitOpen: (path) => ipcRenderer.invoke('git:open', path),
  gitStatus: () => ipcRenderer.invoke('git:status'),
  gitStage: (files) => ipcRenderer.invoke('git:stage', files),
  gitStageAll: () => ipcRenderer.invoke('git:stageAll'),
  gitCommit: (message) => ipcRenderer.invoke('git:commit', message),
  gitPush: (remote, branch) => ipcRenderer.invoke('git:push', remote, branch),
  gitPull: (remote, branch) => ipcRenderer.invoke('git:pull', remote, branch),
  gitGetCurrentBranch: () => ipcRenderer.invoke('git:getCurrentBranch'),
  gitGetHistory: (maxCount) => ipcRenderer.invoke('git:getHistory', maxCount),
  gitGetBranches: () => ipcRenderer.invoke('git:getBranches'),
  gitCreateBranch: (name, checkout) => ipcRenderer.invoke('git:createBranch', name, checkout),
  gitCheckoutBranch: (name) => ipcRenderer.invoke('git:checkoutBranch', name),
  saveCredentials: (remoteUrl, username, password) => ipcRenderer.invoke('git:saveCredentials', remoteUrl, username, password),
  hasCredentials: (remoteUrl) => ipcRenderer.invoke('git:hasCredentials', remoteUrl),
  getRepoPath: () => ipcRenderer.invoke('git:getRepoPath'),
  getRepoName: () => ipcRenderer.invoke('git:getRepoName'),
});
