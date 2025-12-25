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
  gitUnstage: (files) => ipcRenderer.invoke('git:unstage', files),
  gitStageAll: () => ipcRenderer.invoke('git:stageAll'),
  gitCommit: (message) => ipcRenderer.invoke('git:commit', message),
  gitPush: (remote, branch) => ipcRenderer.invoke('git:push', remote, branch),
  gitPull: (remote, branch) => ipcRenderer.invoke('git:pull', remote, branch),
  gitGetCurrentBranch: () => ipcRenderer.invoke('git:getCurrentBranch'),
  gitGetHistory: (maxCount) => ipcRenderer.invoke('git:getHistory', maxCount),
  gitGetBranches: () => ipcRenderer.invoke('git:getBranches'),
  gitCreateBranch: (name, checkout) => ipcRenderer.invoke('git:createBranch', name, checkout),
  gitCheckoutBranch: (name) => ipcRenderer.invoke('git:checkoutBranch', name),
  gitMergeBranchToCurrent: (branchToMerge) => ipcRenderer.invoke('git:mergeBranchToCurrent', branchToMerge),
  saveCredentials: (remoteUrl, username, password) => ipcRenderer.invoke('git:saveCredentials', remoteUrl, username, password),
  hasCredentials: (remoteUrl) => ipcRenderer.invoke('git:hasCredentials', remoteUrl),
  validateExistingCredentials: (remoteUrl) => ipcRenderer.invoke('git:validateExistingCredentials', remoteUrl),
  deleteCredentials: (remoteUrl) => ipcRenderer.invoke('git:deleteCredentials', remoteUrl),
  getRepoPath: () => ipcRenderer.invoke('git:getRepoPath'),
  getRepoName: () => ipcRenderer.invoke('git:getRepoName'),
  getRemoteUrl: (remote) => ipcRenderer.invoke('git:getRemoteUrl', remote),
  getRemoteBranches: () => ipcRenderer.invoke('git:getRemoteBranches'),
  getTags: () => ipcRenderer.invoke('git:getTags'),
  getCommitDiff: (commitHash) => ipcRenderer.invoke('git:getCommitDiff', commitHash),
  deleteBranch: (branchName, force) => ipcRenderer.invoke('git:deleteBranch', branchName, force),
  deleteTag: (tagName) => ipcRenderer.invoke('git:deleteTag', tagName),
  getTagsForCommit: (commitHash) => ipcRenderer.invoke('git:getTagsForCommit', commitHash),
  testGitCredentials: (remoteUrl) => ipcRenderer.invoke('git:testGitCredentials', remoteUrl),
  showOpenDialog: () => ipcRenderer.invoke('dialog:showOpenDialog'),
  getRecentRepos: () => ipcRenderer.invoke('repos:getRecent'),
  addRecentRepo: (path) => ipcRenderer.invoke('repos:addRecent', path),
});
