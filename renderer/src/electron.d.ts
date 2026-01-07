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
  interface Window {
    electronAPI: {
      gitClone: (url: string, path: string, credentials?: { username: string; password: string }) => Promise<{ success: boolean; error?: string }>;
      gitOpen: (path: string) => Promise<{ success: boolean; error?: string }>;
      gitStatus: () => Promise<{ success: boolean; files?: FileChange[]; error?: string }>;
      gitStage: (files: string[]) => Promise<{ success: boolean; error?: string }>;
      gitUnstage: (files: string[]) => Promise<{ success: boolean; error?: string }>;
      gitStageAll: () => Promise<{ success: boolean; error?: string }>;
      gitCommit: (message: string) => Promise<{ success: boolean; error?: string }>;
      gitPush: (remote?: string, branch?: string) => Promise<{ success: boolean; error?: string }>;
      gitPull: (remote?: string, branch?: string) => Promise<{ success: boolean; error?: string }>;
      gitGetCurrentBranch: () => Promise<{ success: boolean; branch?: string; error?: string }>;
      gitGetHistory: (maxCount?: number) => Promise<{ success: boolean; commits?: Commit[]; error?: string }>;
      getStashes: () => Promise<{ success: boolean; stashes?: { name: string; message: string }[]; error?: string }>;
      createStash: () => Promise<{ success: boolean; error?: string }>;
      applyStash: (name: string) => Promise<{ success: boolean; error?: string }>;
      deleteStash: (name: string) => Promise<{ success: boolean; error?: string }>;
      gitGetBranches: () => Promise<{ success: boolean; branches?: string[]; error?: string }>;
      gitCreateBranch: (name: string, checkout?: boolean) => Promise<{ success: boolean; error?: string }>;
      gitCheckoutBranch: (name: string) => Promise<{ success: boolean; error?: string }>;
      gitMergeBranchToCurrent: (branchToMerge: string) => Promise<{ success: boolean; hasConflicts?: boolean; conflictedFiles?: string[]; error?: string }>;
      getConflictedFiles: () => Promise<{ success: boolean; files?: string[]; error?: string }>;
      abortMerge: () => Promise<{ success: boolean; error?: string }>;
      gitRebaseBranch: (branch: string) => Promise<{ success: boolean; error?: string }>;
      gitAbortRebase: () => Promise<{ success: boolean; error?: string }>;
      gitContinueRebase: () => Promise<{ success: boolean; error?: string }>;
      gitGetRebaseStatus: () => Promise<{ success: boolean; inProgress: boolean; currentStep?: number; totalSteps?: number; error?: string }>;
      gitGetCommitsForInteractiveRebase: (targetBranch: string) => Promise<{ success: boolean; commits?: any[]; error?: string }>;
      gitInteractiveRebase: (targetBranch: string, todoLines: string[]) => Promise<{ success: boolean; error?: string }>;
      openFileInMergeTool: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      saveCredentials: (remoteUrl: string, username: string, password: string) => Promise<{ success: boolean; error?: string }>;
      hasCredentials: (remoteUrl: string) => Promise<{ success: boolean; hasCredentials: boolean; error?: string }>;
      validateExistingCredentials: (remoteUrl: string) => Promise<{ success: boolean; error?: string }>;
      deleteCredentials: (remoteUrl: string) => Promise<{ success: boolean; error?: string }>;
      getRepoPath: () => Promise<{ success: boolean; path?: string; error?: string }>;
      getRepoName: () => Promise<{ success: boolean; name?: string; error?: string }>;
      getRemoteUrl: (remote?: string) => Promise<{ success: boolean; url?: string; error?: string }>;
      getRemoteBranches: () => Promise<{ success: boolean; branches?: Array<{ name: string; remote: string }>; error?: string }>;
      getTags: () => Promise<{ success: boolean; tags?: Array<{ name: string; commit: string; date: Date }>; error?: string }>;
      getCommitDiff: (commitHash: string) => Promise<{ success: boolean; files?: Array<{ path: string; status: 'modified' | 'added' | 'deleted'; additions: number; deletions: number; diff: string }>; error?: string }>;
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
      getMergeToolPath: () => Promise<{ success: boolean; mergeToolPath?: string; error?: string }>;
      setMergeToolPath: (path: string) => Promise<{ success: boolean; error?: string }>;
      getMaxCommits: () => Promise<{ success: boolean; maxCommits?: number; error?: string }>;
      setMaxCommits: (maxCommits: number) => Promise<{ success: boolean; error?: string }>;
    };
  }
}
