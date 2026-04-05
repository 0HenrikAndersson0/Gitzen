import { useState, useEffect, useCallback, useRef } from 'react';
import { HistoryFilters } from '../electron';

export interface BranchStatus {
  ahead: number;
  behind: number;
  hasUpstream: boolean;
  upstream?: string;
}

export interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted';
  staged: boolean;
}

export interface Commit {
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

export interface Branch {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  ahead?: number;
  behind?: number;
  upstream?: string;
}

interface UseGitStateProps {
  historyLimit: number;
  checkAuthError: (errorMsg: string, silent?: boolean, errorType?: string) => boolean;
  setHasCredentials: (has: boolean) => void;
  setShowMergeConflictDialog: (show: boolean) => void;
}

function isEqualArray(prev: any[], next: any[]): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;
  
  if (JSON.stringify(prev[0]) !== JSON.stringify(next[0])) return false;
  if (JSON.stringify(prev[prev.length - 1]) !== JSON.stringify(next[next.length - 1])) return false;
  
  return true;
}

export function useGitState({
  historyLimit,
  checkAuthError,
  setHasCredentials,
  setShowMergeConflictDialog
}: UseGitStateProps) {
  const [repoName, setRepoName] = useState<string | null>(null);
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [currentBranch, setCurrentBranch] = useState('main');
  const [branchStatus, setBranchStatus] = useState<BranchStatus | undefined>(undefined);
  const [files, setFiles] = useState<FileChange[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [hasMoreCommits, setHasMoreCommits] = useState(false);
  const [stashes, setStashes] = useState<{ name: string; message: string }[]>([]);
  const [localBranches, setLocalBranches] = useState<Branch[]>([]);
  const [remoteBranches, setRemoteBranches] = useState<Branch[]>([]);
  const [isRefreshingBranches, setIsRefreshingBranches] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [conflictedFiles, setConflictedFiles] = useState<any[]>([]);
  const [rebaseStatus, setRebaseStatus] = useState<{ inProgress: boolean; currentStep?: number; totalSteps?: number; stoppedMessage?: string }>({ inProgress: false });
  const [cherryPickStatus, setCherryPickStatus] = useState<{ inProgress: boolean }>({ inProgress: false });
  const [submodules, setSubmodules] = useState<any[]>([]);
  const [superprojectPath, setSuperprojectPath] = useState<string | null>(null);
  const [historyFilters, setHistoryFiltersState] = useState<HistoryFilters>({});
  
  const historyFiltersRef = useRef(historyFilters);
  const setHistoryFilters = useCallback((filters: HistoryFilters) => {
    historyFiltersRef.current = filters;
    setHistoryFiltersState(filters);
  }, []);

  const lastRebaseStepRef = useRef<number | undefined>(undefined);
  const lastConflictCountRef = useRef<number>(0);
  const repoPathRef = useRef<string | null>(null);
  const gitOperationQueue = useRef<Promise<any>>(Promise.resolve());

  useEffect(() => {
    repoPathRef.current = repoPath;
  }, [repoPath]);

  const runQueued = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const nextOp = gitOperationQueue.current.then(operation);
    gitOperationQueue.current = nextOp.then(
      () => { },
      () => { } // Continue queue even if operation fails
    );
    return nextOp;
  }, []);

  const refreshStatusInternal = useCallback(async (pathOverride?: string) => {
    const targetPath = pathOverride || repoPath;
    if (!targetPath) return;
    try {
      const result = await window.electronAPI.gitStatus();
      if (!pathOverride && targetPath !== repoPathRef.current) return;
      if (result.success && result.files) {
        setFiles(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(result.files)) {
            return result.files!;
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('Failed to refresh status:', error);
    }
  }, [repoPath]);

  const refreshStatus = useCallback((pathOverride?: string) => {
    return runQueued(() => refreshStatusInternal(pathOverride));
  }, [refreshStatusInternal, runQueued]);

  const refreshSubmodulesInternal = useCallback(async (pathOverride?: string) => {
    const targetPath = pathOverride || repoPath;
    if (!targetPath) return;
    try {
      const result = await (window as any).electronAPI.getSubmodules();
      if (!pathOverride && targetPath !== repoPathRef.current) return;
      if (result.success && result.submodules) {
        setSubmodules(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(result.submodules)) {
            return result.submodules;
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('Failed to refresh submodules:', error);
    }
  }, [repoPath]);

  const refreshSubmodules = useCallback((pathOverride?: string) => {
    return runQueued(() => refreshSubmodulesInternal(pathOverride));
  }, [refreshSubmodulesInternal, runQueued]);

  const refreshSuperprojectPathInternal = useCallback(async (pathOverride?: string) => {
    const targetPath = pathOverride || repoPath;
    if (!targetPath) return;
    try {
      const result = await window.electronAPI.getSuperprojectPath();
      if (!pathOverride && targetPath !== repoPathRef.current) return;
      if (result.success && result.path) {
        setSuperprojectPath(result.path);
      } else {
        setSuperprojectPath(null);
      }
    } catch (error) {
      console.error('Failed to get superproject:', error);
      setSuperprojectPath(null);
    }
  }, [repoPath]);

  const refreshSuperprojectPath = useCallback((pathOverride?: string) => {
    return runQueued(() => refreshSuperprojectPathInternal(pathOverride));
  }, [refreshSuperprojectPathInternal, runQueued]);

  const refreshBranchInternal = useCallback(async (pathOverride?: string) => {
    const targetPath = pathOverride || repoPath;
    if (!targetPath) return;
    try {
      const result = await window.electronAPI.gitGetCurrentBranch();
      if (!pathOverride && targetPath !== repoPathRef.current) return;
      if (result.success && result.branch && result.branch.trim()) {
        const newBranch = result.branch.trim();
        setCurrentBranch((prevBranch) => {
          return newBranch !== prevBranch ? newBranch : prevBranch;
        });
      }
    } catch (error) {
      console.error('Failed to refresh branch:', error);
    }
  }, [repoPath]);

  const refreshBranch = useCallback((pathOverride?: string) => {
    return runQueued(() => refreshBranchInternal(pathOverride));
  }, [refreshBranchInternal, runQueued]);

  const refreshBranchesInternal = useCallback(async (pathOverride?: string, silent = false) => {
    const targetPath = pathOverride || repoPath;
    if (!targetPath) return;
    if (!silent) setIsRefreshingBranches(true);
    try {
      const [localResult, remoteResult] = await Promise.all([
        window.electronAPI.gitGetBranchesDetailed(),
        window.electronAPI.getRemoteBranches(),
      ]);

      if (!pathOverride && targetPath !== repoPathRef.current) return;

      if (localResult.success && localResult.branches) {
        const newLocalBranches = localResult.branches.map((b: any) => ({
          name: b.name,
          isRemote: false,
          isCurrent: b.current,
          ahead: b.ahead,
          behind: b.behind,
          upstream: b.upstream
        }));
        setLocalBranches(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(newLocalBranches)) {
            return newLocalBranches;
          }
          return prev;
        });
      }
      if (remoteResult.success && remoteResult.branches) {
        const newRemoteBranches = remoteResult.branches.map((b: any) => ({
          name: `${b.remote}/${b.name}`, isRemote: true, isCurrent: false
        }));
        setRemoteBranches(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(newRemoteBranches)) {
            return newRemoteBranches;
          }
          return prev;
        });
      }
    } catch (e) {
      console.error('Failed to refresh branches', e);
    } finally {
      if (targetPath === repoPathRef.current) {
        setIsRefreshingBranches(false);
      }
    }
  }, [repoPath]);

  const refreshBranches = useCallback((pathOverride?: string, silent = false) => {
    return runQueued(() => refreshBranchesInternal(pathOverride, silent));
  }, [refreshBranchesInternal, runQueued]);

  const refreshBranchStatusInternal = useCallback(async (pathOverride?: string) => {
    const targetPath = pathOverride || repoPath;
    if (!targetPath) return;
    try {
      const result = await window.electronAPI.gitGetBranchStatus();
      if (!pathOverride && targetPath !== repoPathRef.current) return;
      if (result.success) {
        setBranchStatus(prev => {
          const newState = {
            ahead: result.ahead || 0,
            behind: result.behind || 0,
            hasUpstream: !!result.hasUpstream,
            upstream: result.upstream
          };
          if (JSON.stringify(prev) !== JSON.stringify(newState)) {
            return newState;
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('Failed to refresh branch status:', error);
    }
  }, [repoPath]);

  const refreshBranchStatus = useCallback((pathOverride?: string) => {
    return runQueued(() => refreshBranchStatusInternal(pathOverride));
  }, [refreshBranchStatusInternal, runQueued]);

  const performFetchInternal = useCallback(async (pathOverride?: string, silent = false) => {
    const targetPath = pathOverride || repoPath;
    if (!targetPath) return;
    try {
      const result = await window.electronAPI.gitFetchAll();
      if (result.success) {
        setHasCredentials(true);
      } else if (result.error) {
        checkAuthError(result.error, silent, result.errorType);
      }
    } catch (e) {
      console.error('Failed to fetch', e);
      if (e instanceof Error) checkAuthError(e.message, silent);
    }
  }, [repoPath, setHasCredentials, checkAuthError]);

  const performFetch = useCallback((pathOverride?: string, silent = false) => {
    return runQueued(async () => {
      await performFetchInternal(pathOverride, silent);
      await refreshBranchStatusInternal(pathOverride || repoPath || undefined);
      await refreshBranchesInternal(pathOverride || repoPath || undefined, silent);
    });
  }, [performFetchInternal, refreshBranchStatusInternal, refreshBranchesInternal, runQueued, repoPath]);

  const refreshHistoryInternal = useCallback(async (pathOverride?: string) => {
    const targetPath = pathOverride || repoPath;
    if (!targetPath) return;
    try {
      const result = await window.electronAPI.gitGetHistory(historyLimit, historyFiltersRef.current);
      if (!pathOverride && targetPath !== repoPathRef.current) return;
      if (result.success) {
        if (result.commits) {
          setCommits(prev => {
            if (JSON.stringify(prev) !== JSON.stringify(result.commits)) {
              return result.commits!;
            }
            return prev;
          });
        }
        setHasMoreCommits(!!result.hasMore);
      }
    } catch (error) {
      console.error('Failed to refresh history:', error);
    }
  }, [repoPath, historyLimit]);

  const refreshHistory = useCallback((pathOverride?: string) => {
    return runQueued(() => refreshHistoryInternal(pathOverride));
  }, [refreshHistoryInternal, runQueued]);

  const refreshStashesInternal = useCallback(async (pathOverride?: string) => {
    const targetPath = pathOverride || repoPath;
    if (!targetPath) return;
    try {
      const result = await (window.electronAPI as any).getStashes();
      if (!pathOverride && targetPath !== repoPathRef.current) return;
      if (result.success) {
        if (result.stashes) {
          setStashes(prev => {
            if (!isEqualArray(prev, result.stashes!)) {
              return result.stashes!;
            }
            return prev;
          });
        }
      }
    } catch (error) {
      console.error('Failed to refresh stashes:', error);
    }
  }, [repoPath]);

  const refreshStashes = useCallback((pathOverride?: string) => {
    return runQueued(() => refreshStashesInternal(pathOverride));
  }, [refreshStashesInternal, runQueued]);

  const refreshRebaseStatusInternal = useCallback(async (pathOverride?: string) => {
    const targetPath = pathOverride || repoPath;
    if (!targetPath) return;
    try {
      const [rebaseResult, cherryPickResult] = await Promise.all([
        window.electronAPI.gitGetRebaseStatus(),
        window.electronAPI.gitGetCherryPickStatus()
      ]);

      if (!pathOverride && targetPath !== repoPathRef.current) return;

      if (cherryPickResult.success) {
        setCherryPickStatus({ inProgress: cherryPickResult.inProgress });
      }

      if (rebaseResult.success) {
        setRebaseStatus({ inProgress: rebaseResult.inProgress, currentStep: rebaseResult.currentStep, totalSteps: rebaseResult.totalSteps });

        if (rebaseResult.inProgress || cherryPickResult.inProgress) {
          const conflictResult = await window.electronAPI.getConflictedFiles();
          const conflicts = conflictResult.success && conflictResult.files ? conflictResult.files : [];
          setConflictedFiles(conflicts);

          if (rebaseResult.inProgress) {
            const currentStep = rebaseResult.currentStep;
            const hasConflicts = conflicts.length > 0;

            if (hasConflicts) {
              const stepChanged = currentStep !== lastRebaseStepRef.current;
              const conflictsAppeared = lastConflictCountRef.current === 0;

              if (stepChanged || conflictsAppeared) {
                setShowMergeConflictDialog(true);
              }
            }
            lastRebaseStepRef.current = currentStep;
          } else if (cherryPickResult.inProgress && conflicts.length > 0 && lastConflictCountRef.current === 0) {
            setShowMergeConflictDialog(true);
          }

          lastConflictCountRef.current = conflicts.length;
        } else {
          if (lastRebaseStepRef.current !== undefined || lastConflictCountRef.current > 0) {
            setConflictedFiles([]);
            setShowMergeConflictDialog(false);
            lastRebaseStepRef.current = undefined;
            lastConflictCountRef.current = 0;
          }
        }
      }
    } catch (error) {
      console.error('Failed to check rebase/cherry-pick status:', error);
    }
  }, [repoPath, setShowMergeConflictDialog]);

  const refreshRebaseStatus = useCallback((pathOverride?: string) => {
    return runQueued(() => refreshRebaseStatusInternal(pathOverride));
  }, [refreshRebaseStatusInternal, runQueued]);

  const refreshBranchesSilent = useCallback(() => refreshBranches(undefined, true), [refreshBranches]);
  const performFetchSilent = useCallback(() => performFetch(undefined, true), [performFetch]);

  useEffect(() => {
    if (repoPath) {
      refreshHistory();
    }
  }, [historyLimit, refreshHistory, repoPath]);

  useEffect(() => {
    if (!repoPath) return;

    const removeListener = window.electronAPI.onRepoChanged(() => {
      refreshStatus();
      refreshBranch();
      refreshBranchesSilent();
      refreshHistory();
      refreshStashes();
      refreshRebaseStatus();
      refreshBranchStatus();
      refreshSubmodules();
      refreshSuperprojectPath();
      performFetchSilent();
    });

    return () => {
      if (typeof removeListener === 'function') {
        removeListener();
      }
    };
  }, [
    repoPath,
    refreshStatus,
    refreshBranch,
    refreshBranchesSilent,
    refreshHistory,
    refreshStashes,
    refreshRebaseStatus,
    refreshBranchStatus,
    refreshSubmodules,
    refreshSuperprojectPath,
    performFetchSilent
  ]);

  // Fetch remote changes when the application regains focus
  useEffect(() => {
    if (!repoPath) return;

    const onFocus = () => {
      performFetchSilent();
    };

    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [repoPath, performFetchSilent]);

  const refreshAllData = useCallback(async (path: string) => {
    repoPathRef.current = path;

    await Promise.all([
      refreshStatusInternal(path),
      refreshBranchInternal(path),
      refreshBranchesInternal(path),
      refreshHistoryInternal(path),
      refreshStashesInternal(path),
      refreshBranchStatusInternal(path),
      refreshRebaseStatusInternal(path),
      refreshSubmodulesInternal(path),
      refreshSuperprojectPathInternal(path)
    ]);
  }, [
    refreshStatusInternal,
    refreshBranchInternal,
    refreshBranchesInternal,
    refreshHistoryInternal,
    refreshStashesInternal,
    refreshBranchStatusInternal,
    refreshRebaseStatusInternal,
    refreshSubmodulesInternal,
    refreshSuperprojectPathInternal
  ]);

  return {
    repoName, setRepoName,
    repoPath, setRepoPath,
    currentBranch, setCurrentBranch,
    branchStatus, setBranchStatus,
    files, setFiles,
    commits, setCommits,
    hasMoreCommits, setHasMoreCommits,
    stashes, setStashes,
    localBranches, setLocalBranches,
    remoteBranches, setRemoteBranches,
    isRefreshingBranches, setIsRefreshingBranches,
    remoteUrl, setRemoteUrl,
    conflictedFiles, setConflictedFiles,
    rebaseStatus, setRebaseStatus,
    cherryPickStatus, setCherryPickStatus,
    submodules, setSubmodules,
    superprojectPath, setSuperprojectPath,

    runQueued,
    refreshAllData,
    refreshStatusInternal,
    refreshStatus,
    refreshBranchInternal,
    refreshBranch,
    refreshBranchesInternal,
    refreshBranches,
    refreshBranchStatusInternal,
    refreshBranchStatus,
    performFetchInternal,
    performFetch,
    refreshHistoryInternal,
    refreshHistory,
    refreshStashesInternal,
    refreshStashes,
    refreshRebaseStatusInternal,
    refreshRebaseStatus,
    refreshSubmodulesInternal,
    refreshSubmodules,
    refreshSuperprojectPathInternal,
    refreshSuperprojectPath,
    refreshBranchesSilent,
    performFetchSilent,
    historyFilters,
    setHistoryFilters
  };
}
