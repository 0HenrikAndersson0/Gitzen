export {};

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

declare global {
  interface ConflictedFile {
    path: string;
    type: 'both-modified' | 'deleted-by-us' | 'deleted-by-them' | 'both-added' | 'both-deleted' | 'added-by-us' | 'added-by-them' | 'unknown';
  }

  interface Window {
    electronAPI: {
      gitClone: (url: string, path: string, credentials?: { username: string; password: string }) => Promise<{ success: boolean; error?: string }>;
      gitOpen: (path: string) => Promise<{ success: boolean; error?: string }>;
      gitStatus: () => Promise<{ success: boolean; files?: FileChange[]; error?: string }>;
      gitStage: (files: string[]) => Promise<{ success: boolean; error?: string }>;
      gitUnstage: (files: string[]) => Promise<{ success: boolean; error?: string }>;
      gitStageAll: () => Promise<{ success: boolean; error?: string }>;
      gitCommit: (message: string) => Promise<{ success: boolean; error?: string }>;
      gitPush: (remote?: string, branch?: string, force?: boolean, overwrite?: boolean) => Promise<{ success: boolean; error?: string }>;
      gitPull: (remote?: string, branch?: string, targetBranch?: string) => Promise<{ success: boolean; error?: string }>;
      gitAddRemote: (name: string, url: string) => Promise<{ success: boolean; error?: string }>;
      gitCreateGitHubRepo: (token: string, name: string, isPrivate: boolean, description?: string) => Promise<{ success: boolean; cloneUrl?: string; ownerLogin?: string; error?: string }>;
      gitGetBranchStatus: () => Promise<{ success: boolean; ahead?: number; behind?: number; hasUpstream?: boolean; upstream?: string; error?: string }>;
      gitGetCurrentBranch: () => Promise<{ success: boolean; branch?: string; error?: string }>;
      gitGetHistory: (maxCount?: number) => Promise<{ success: boolean; commits?: Commit[]; hasMore?: boolean; error?: string }>;
      getStashes: () => Promise<{ success: boolean; stashes?: { name: string; message: string }[]; error?: string }>;
      createStash: () => Promise<{ success: boolean; error?: string }>;
      applyStash: (name: string) => Promise<{ success: boolean; error?: string }>;
      deleteStash: (name: string) => Promise<{ success: boolean; error?: string }>;
      gitGetBranches: () => Promise<{ success: boolean; branches?: string[]; error?: string }>;
      gitGetBranchesDetailed: () => Promise<{ success: boolean; branches?: Array<{ name: string; current: boolean; upstream?: string; ahead: number; behind: number }>; error?: string }>;
      gitFetch: (remote?: string) => Promise<{ success: boolean; error?: string }>;
      gitFetchAll: () => Promise<{ success: boolean; error?: string }>;
      gitCreateBranch: (name: string, checkout?: boolean) => Promise<{ success: boolean; error?: string }>;
      gitCheckoutBranch: (name: string) => Promise<{ success: boolean; error?: string }>;
      gitMergeBranchToCurrent: (branchToMerge: string) => Promise<{ success: boolean; hasConflicts?: boolean; conflictedFiles?: ConflictedFile[]; error?: string }>;
      getConflictedFiles: () => Promise<{ success: boolean; files?: ConflictedFile[]; error?: string }>;
      resolveConflict: (filePath: string, decision: 'keep' | 'delete') => Promise<{ success: boolean; error?: string }>;
      abortMerge: () => Promise<{ success: boolean; error?: string }>;
      gitRevertCommit: (commitHash: string) => Promise<{ success: boolean; error?: string }>;
      gitResetCommits: (commitHash: string, mode: 'soft' | 'mixed' | 'hard') => Promise<{ success: boolean; error?: string }>;
      gitGetRevertStatus: () => Promise<{ success: boolean; inProgress: boolean; error?: string }>;
      gitAbortRevert: () => Promise<{ success: boolean; error?: string }>;
      gitContinueRevert: () => Promise<{ success: boolean; error?: string }>;
      gitRebaseBranch: (branch: string) => Promise<{ success: boolean; error?: string }>;
      gitAbortRebase: () => Promise<{ success: boolean; error?: string }>;
      gitContinueRebase: () => Promise<{ success: boolean; error?: string }>;
      gitGetRebaseStatus: () => Promise<{ success: boolean; inProgress: boolean; currentStep?: number; totalSteps?: number; error?: string }>;
      gitCherryPick: (commitHash: string) => Promise<{ success: boolean; error?: string }>;
      gitAbortCherryPick: () => Promise<{ success: boolean; error?: string }>;
      gitContinueCherryPick: () => Promise<{ success: boolean; error?: string }>;
      gitSkipCherryPick: () => Promise<{ success: boolean; error?: string }>;
      gitGetCherryPickStatus: () => Promise<{ success: boolean; inProgress: boolean; error?: string }>;
      gitGetCommitsForInteractiveRebase: (targetBranch: string) => Promise<{ success: boolean; commits?: any[]; error?: string }>;
      gitInteractiveRebase: (targetBranch: string, todoLines: string[]) => Promise<{ success: boolean; error?: string }>;
      openFileInMergeTool: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      saveCredentials: (remoteUrl: string, username: string, password: string) => Promise<{ success: boolean; error?: string }>;
      hasCredentials: (remoteUrl: string) => Promise<{ success: boolean; hasCredentials: boolean; error?: string }>;
      validateExistingCredentials: (remoteUrl: string) => Promise<{ success: boolean; error?: string }>;
      deleteCredentials: (remoteUrl: string) => Promise<{ success: boolean; error?: string }>;
      listCredentials: () => Promise<{ success: boolean; credentials?: string[]; error?: string }>;
      getRepoPath: () => Promise<{ success: boolean; path?: string; error?: string }>;
      getRepoName: () => Promise<{ success: boolean; name?: string; error?: string }>;
      getRemoteUrl: (remote?: string) => Promise<{ success: boolean; url?: string; error?: string }>;
      getRemoteBranches: () => Promise<{ success: boolean; branches?: Array<{ name: string; remote: string }>; error?: string }>;
      getTags: () => Promise<{ success: boolean; tags?: Array<{ name: string; commit: string; date: Date }>; error?: string }>;
      getCommitDiff: (commitHash: string) => Promise<{ success: boolean; files?: Array<{ path: string; status: 'modified' | 'added' | 'deleted'; additions: number; deletions: number; diff: string }>; error?: string }>;
      getFileDiff: (filePath: string, staged: boolean) => Promise<{ success: boolean; diff?: string; error?: string }>;
      applyPatch: (patch: string, options?: { reverse?: boolean; cached?: boolean }) => Promise<{ success: boolean; error?: string }>;
      revertFileChanges: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      deleteBranch: (branchName: string, force?: boolean) => Promise<{ success: boolean; error?: string }>;
      deleteRemoteBranch: (branchName: string) => Promise<{ success: boolean; error?: string }>;
      deleteTag: (tagName: string) => Promise<{ success: boolean; error?: string }>;
      createTag: (name: string, commitHash?: string) => Promise<{ success: boolean; error?: string }>;
      pushTag: (tagName: string, remote?: string) => Promise<{ success: boolean; error?: string }>;
      getRemoteTags: (remote?: string) => Promise<{ success: boolean; tags?: string[]; error?: string }>;
      getTagsForCommit: (commitHash: string) => Promise<{ success: boolean; tags?: string[]; error?: string }>;
      testGitCredentials: (remoteUrl: string) => Promise<{ success: boolean; error?: string }>;
      showOpenDialog: (options?: { properties?: string[]; title?: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
        getRecentRepos: () => Promise<{ success: boolean; repos?: RecentRepo[]; error?: string }>;
        addRecentRepo: (path: string) => Promise<{ success: boolean; error?: string }>;
        removeRecentRepo: (path: string) => Promise<{ success: boolean; error?: string }>;
        getMergeToolPath: () => Promise<{ success: boolean; mergeToolPath?: string; error?: string }>;      setMergeToolPath: (path: string) => Promise<{ success: boolean; error?: string }>;
      getMaxCommits: () => Promise<{ success: boolean; maxCommits?: number; error?: string }>;
      setMaxCommits: (maxCommits: number) => Promise<{ success: boolean; error?: string }>;
      onShowShortcuts: (callback: () => void) => void;
    };
  }
}
