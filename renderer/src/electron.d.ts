export { };

interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted';
  staged: boolean;
}

interface Commit {
  id: string;
  message: string;
  author: string;
  timestamp: Date;
  branch?: string;
  hash: string;
  isMerge?: boolean;
  parents?: string[];
  refs?: string;
}

interface RecentRepo {
  path: string;
  name: string;
  lastOpened: number;
}

export interface HistoryFilters {
  author?: string;
  since?: string;
  until?: string;
  file?: string;
  message?: string;
}

declare global {
  interface ConflictedFile {
    path: string;
    type: 'both-modified' | 'deleted-by-us' | 'deleted-by-them' | 'both-added' | 'both-deleted' | 'added-by-us' | 'added-by-them' | 'unknown';
  }

  interface Window {
    electronAPI: {
      gitClone: (url: string, path: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitOpen: (path: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitStatus: () => Promise<{ success: boolean; files?: FileChange[]; error?: string; errorType?: string }>;
      gitStage: (files: string[]) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitUnstage: (files: string[]) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitStageAll: () => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitUnstageAll: () => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitCommit: (message: string, amend?: boolean) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitGenerateCommitMessage: () => Promise<{ success: boolean; message?: string; error?: string }>;
      gitGenerateConflictResolution: (filePath: string) => Promise<{ success: boolean; explanation?: string; resolvedCode?: string; error?: string }>;
      gitApplyConflictResolution: (filePath: string, resolvedCode: string) => Promise<{ success: boolean; error?: string }>;
      gitUndoCommit: () => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitPush: (remote?: string, branch?: string, force?: boolean, overwrite?: boolean) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitPull: (remote?: string, branch?: string, targetBranch?: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitAddRemote: (name: string, url: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitCreateGitHubRepo: (token: string, name: string, isPrivate: boolean, description?: string) => Promise<{ success: boolean; cloneUrl?: string; ownerLogin?: string; error?: string; errorType?: string }>;
      gitGetBranchStatus: () => Promise<{ success: boolean; ahead?: number; behind?: number; hasUpstream?: boolean; upstream?: string; error?: string; errorType?: string }>;
      gitGetCurrentBranch: () => Promise<{ success: boolean; branch?: string; error?: string; errorType?: string }>;
      gitGetHistory: (maxCount?: number, filters?: HistoryFilters) => Promise<{ success: boolean; commits?: Commit[]; hasMore?: boolean; error?: string; errorType?: string }>;
      getStashes: () => Promise<{ success: boolean; stashes?: { name: string; message: string }[]; error?: string; errorType?: string }>;
      createStash: (message?: string, files?: string[]) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      applyStash: (name: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      deleteStash: (name: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitGetBranches: () => Promise<{ success: boolean; branches?: string[]; error?: string; errorType?: string }>;
      gitGetBranchesDetailed: () => Promise<{ success: boolean; branches?: Array<{ name: string; current: boolean; upstream?: string; ahead: number; behind: number }>; error?: string; errorType?: string }>;
      gitFetch: (remote?: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitFetchAll: () => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitCreateBranch: (name: string, checkout?: boolean) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitCheckoutBranch: (name: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitGetBranchHeadIndex: (name: string) => Promise<{ success: boolean; index?: number; error?: string }>;
      gitMergeBranchToCurrent: (branchToMerge: string) => Promise<{ success: boolean; hasConflicts?: boolean; conflictedFiles?: ConflictedFile[]; error?: string; errorType?: string }>;
      getConflictedFiles: () => Promise<{ success: boolean; files?: ConflictedFile[]; error?: string; errorType?: string }>;
      resolveConflict: (filePath: string, decision: 'keep' | 'delete') => Promise<{ success: boolean; error?: string; errorType?: string }>;
      abortMerge: () => Promise<{ success: boolean; error?: string; errorType?: string }>;
      abortConflict: () => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitRevertCommit: (commitHash: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitResetCommits: (commitHash: string, mode: 'soft' | 'mixed' | 'hard') => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitGetRevertStatus: () => Promise<{ success: boolean; inProgress: boolean; error?: string; errorType?: string }>;
      gitAbortRevert: () => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitContinueRevert: () => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitRebaseBranch: (branch: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitAbortRebase: () => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitContinueRebase: () => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitGetRebaseStatus: () => Promise<{ success: boolean; inProgress: boolean; currentStep?: number; totalSteps?: number; stoppedMessage?: string; error?: string; errorType?: string }>;
      gitCherryPick: (commitHash: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitAbortCherryPick: () => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitContinueCherryPick: () => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitSkipCherryPick: () => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitGetCherryPickStatus: () => Promise<{ success: boolean; inProgress: boolean; error?: string; errorType?: string }>;
      gitGetCommitsForInteractiveRebase: (targetBranch: string) => Promise<{ success: boolean; commits?: any[]; error?: string; errorType?: string }>;
      gitInteractiveRebase: (targetBranch: string, todoLines: string[]) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitCancelOperation: () => Promise<{ success: boolean; error?: string; errorType?: string }>;
      openFileInMergeTool: (filePath: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      openFileInDefaultEditor: (filePath: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      openTerminal: () => Promise<{ success: boolean; error?: string }>;
      checkGitFlowInitialized: () => Promise<{ success: boolean; initialized?: boolean; error?: string; errorType?: string }>;
      initializeGitFlow: () => Promise<{ success: boolean; error?: string; errorType?: string }>;
      startGitFlowBranch: (type: 'feature' | 'bugfix' | 'release' | 'hotfix' | 'support', name: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      finishGitFlowBranch: (type: 'feature' | 'bugfix' | 'release' | 'hotfix' | 'support', name: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      getSubmodules: () => Promise<{ success: boolean; submodules?: Array<{ name: string; path: string; url: string; commitHash: string; status: 'synced'|'out-of-sync'|'uninitialized'|'conflict'|'unknown' }>; error?: string; errorType?: string }>;
      addSubmodule: (url: string, path: string, applyConfigs: boolean) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      updateSubmodules: () => Promise<{ success: boolean; error?: string; errorType?: string }>;
      removeSubmodule: (path: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      getRepoPath: () => Promise<{ success: boolean; path?: string; error?: string; errorType?: string }>;
      getSuperprojectPath: () => Promise<{ success: boolean; path?: string; error?: string; errorType?: string }>;
      getRepoName: () => Promise<{ success: boolean; name?: string; error?: string; errorType?: string }>;
      getFilesChurn: (limit?: number) => Promise<{ success: boolean; files?: Array<{ path: string; changes: number }>; error?: string; errorType?: string }>;
      getCommitActivity: () => Promise<{ success: boolean; activity?: Array<{ day: number; hour: number; count: number }>; error?: string; errorType?: string }>;
      getTopContributors: (limit?: number) => Promise<{ success: boolean; contributors?: Array<{ name: string; commits: number }>; error?: string; errorType?: string }>;
      getCodebaseGrowth: () => Promise<{ success: boolean; growth?: Array<{ date: string; additions: number; deletions: number; totalLines: number }>; error?: string; errorType?: string }>;
      getFileTypeDistribution: () => Promise<{ success: boolean; distribution?: Array<{ type: string; count: number }>; error?: string; errorType?: string }>;
      getRemoteUrl: (remote?: string) => Promise<{ success: boolean; url?: string; error?: string; errorType?: string }>;
      setRemoteUrl: (remote: string, url: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      getRemoteBranches: () => Promise<{ success: boolean; branches?: Array<{ name: string; remote: string }>; error?: string; errorType?: string }>;
      getTags: () => Promise<{ success: boolean; tags?: Array<{ name: string; commit: string; date: Date }>; error?: string; errorType?: string }>;
      getCommitDiff: (commitHash: string) => Promise<{ success: boolean; files?: Array<{ path: string; status: 'modified' | 'added' | 'deleted'; additions: number; deletions: number; diff: string }>; error?: string; errorType?: string }>;
      gitGetBranchDiff: (branchName: string) => Promise<{ success: boolean; baseBranch?: string; files?: Array<{ path: string; status: 'modified' | 'added' | 'deleted'; additions: number; deletions: number; diff: string }>; error?: string }>;
      gitGetAIBranchReview: (branchName: string) => Promise<{ success: boolean; summary?: string; explanation?: string; error?: string }>;
      getFileDiff: (filePath: string, staged: boolean) => Promise<{ success: boolean; diff?: string; error?: string; errorType?: string }>;
      getFileBlame: (filePath: string, commitHash?: string) => Promise<{ success: boolean; blame?: Array<{ commitHash: string; author: string; date: string; lineNo: number; content: string; }>; error?: string; errorType?: string }>;
      applyPatch: (patch: string, options?: { reverse?: boolean; cached?: boolean }) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      revertFileChanges: (filePath: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      deleteBranch: (branchName: string, force?: boolean) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      renameBranch: (oldName: string, newName: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      deleteRemoteBranch: (branchName: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      deleteTag: (tagName: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      createTag: (name: string, commitHash?: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      pushTag: (tagName: string, remote?: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      getRemoteTags: (remote?: string) => Promise<{ success: boolean; tags?: string[]; error?: string; errorType?: string }>;
      getTagsForCommit: (commitHash: string) => Promise<{ success: boolean; tags?: string[]; error?: string; errorType?: string }>;
      testGitCredentials: (remoteUrl: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      showOpenDialog: (options?: { properties?: string[]; title?: string }) => Promise<{ success: boolean; path?: string; error?: string; errorType?: string }>;
      getRecentRepos: () => Promise<{ success: boolean; repos?: RecentRepo[]; error?: string; errorType?: string }>;
      addRecentRepo: (path: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      removeRecentRepo: (path: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      getMergeToolPath: () => Promise<{ success: boolean; mergeToolPath?: string; error?: string; errorType?: string }>; setMergeToolPath: (path: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      getMaxCommits: () => Promise<{ success: boolean; maxCommits?: number; error?: string; errorType?: string }>;
      setMaxCommits: (maxCommits: number) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      getTheme: () => Promise<{ success: boolean; theme?: string; error?: string; errorType?: string }>;
      setTheme: (theme: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      getAIProvider: () => Promise<{ success: boolean; provider?: 'agy' | 'claude' | 'ollama' | 'copilot'; error?: string; errorType?: string }>;
      setAIProvider: (provider: 'agy' | 'claude' | 'ollama' | 'copilot') => Promise<{ success: boolean; error?: string; errorType?: string }>;
      getOllamaModel: () => Promise<{ success: boolean; model?: string; error?: string; errorType?: string }>;
      setOllamaModel: (model: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      getOllamaHost: () => Promise<{ success: boolean; host?: string; error?: string; errorType?: string }>;
      setOllamaHost: (host: string) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      gitGetOllamaModels: () => Promise<{ success: boolean; models?: string[]; error?: string; errorType?: string }>;
      checkForUpdates: () => Promise<any>;
      openExternal: (url: string) => Promise<{ success: boolean }>;
      onShowShortcuts: (callback: () => void) => void;
      onThemeChanged: (callback: (theme: string) => void) => void;
      onUpdateAvailable: (callback: (updateInfo: any) => void) => void;
      onRepoChanged: (callback: (data: any) => void) => () => void;
      getGitUserConfig: () => Promise<{ success: boolean; name?: string; email?: string; error?: string; errorType?: string }>;
      setGitUserConfig: (name: string, email: string, isGlobal: boolean) => Promise<{ success: boolean; error?: string; errorType?: string }>;
      ptySpawn: (sessionId: string, command: string, args: string[], cwd: string) => Promise<{ success: boolean; alreadyExists?: boolean; error?: string }>;
      ptyWrite: (sessionId: string, data: string) => Promise<{ success: boolean; error?: string }>;
      ptyResize: (sessionId: string, cols: number, rows: number) => Promise<{ success: boolean; error?: string }>;
      ptyKill: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
      ptyRestore: (sessionId: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      ptyExists: (sessionId: string) => Promise<{ success: boolean; exists?: boolean; error?: string }>;
      onPtyData: (sessionId: string, callback: (data: string) => void) => () => void;
      onPtyExit: (sessionId: string, callback: (data: { exitCode: number, signal: number }) => void) => () => void;
    };
  }
}
