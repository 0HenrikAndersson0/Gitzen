import { useState, useEffect, useCallback, useRef } from 'react';
import { CloneRepo } from './components/CloneRepo';
import { OpenRepo } from './components/OpenRepo';
import { CommitPanel } from './components/CommitPanel';
import { ActivityLog } from './components/ActivityLog';
import { AddRemoteDialog } from './components/AddRemoteDialog';
import { RepoHeader } from './components/RepoHeader';
import { MergeConflictDialog } from './components/MergeConflictDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { CommitGraph } from './components/CommitGraph';
import { BranchesPanel } from './components/BranchesPanel';
import { TagsPanel } from './components/TagsPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import { LoadingOverlay } from './components/ui/spinner';
import { SplashScreen } from './components/SplashScreen';
import { ForcePushDialog } from './components/ForcePushDialog';
import { ShortcutsModal } from './components/ShortcutsModal';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './components/ui/dialog';

interface BranchStatus {
  ahead: number;
  behind: number;
  hasUpstream: boolean;
  upstream?: string;
}

interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted';
  staged: boolean;
}

interface LogEntry {
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
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

interface Branch {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  ahead?: number;
  behind?: number;
  upstream?: string;
}

export default function App() {
  const [repoName, setRepoName] = useState<string | null>(null);
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState(50);
  const [currentBranch, setCurrentBranch] = useState('main');
  const [showAddRemoteDialog, setShowAddRemoteDialog] = useState(false);
  const [showForcePushDialog, setShowForcePushDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetTargetCommit, setResetTargetCommit] = useState<string | null>(null);
  const [branchStatus, setBranchStatus] = useState<BranchStatus | undefined>(undefined);
  const [files, setFiles] = useState<FileChange[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [hasMoreCommits, setHasMoreCommits] = useState(false);
  const [stashes, setStashes] = useState<{ name: string; message: string }[]>([]);
  const [localBranches, setLocalBranches] = useState<Branch[]>([]);
  const [remoteBranches, setRemoteBranches] = useState<Branch[]>([]);
  const [isRefreshingBranches, setIsRefreshingBranches] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'clone' | 'open'>('clone');
  const [showMergeConflictDialog, setShowMergeConflictDialog] = useState(false);
  const [conflictedFiles, setConflictedFiles] = useState<any[]>([]);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [rebaseStatus, setRebaseStatus] = useState<{ inProgress: boolean; currentStep?: number; totalSteps?: number }>({ inProgress: false });
  const [cherryPickStatus, setCherryPickStatus] = useState<{ inProgress: boolean }>({ inProgress: false });
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | undefined>(undefined);
  const [showSplash, setShowSplash] = useState(true);
  const [hasCredentials, setHasCredentials] = useState(true);
  
  // UI Layout State
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);

  // Keyboard Shortcuts State
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | undefined>(undefined);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showCreateBranchDialog, setShowCreateBranchDialog] = useState(false);

  const lastRebaseStepRef = useRef<number | undefined>(undefined);
  const lastConflictCountRef = useRef<number>(0);
  const repoPathRef = useRef<string | null>(null);
  const gitOperationQueue = useRef<Promise<any>>(Promise.resolve());

  // Refs for shortcuts
  const filesRef = useRef(files);
  const selectedFileIndexRef = useRef(selectedFileIndex);
  const commitMessageRef = useRef(commitMessage);
  const commitMessageTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { selectedFileIndexRef.current = selectedFileIndex; }, [selectedFileIndex]);
  useEffect(() => { commitMessageRef.current = commitMessage; }, [commitMessage]);

  // Keep selected file index in bounds
  useEffect(() => {
    if (selectedFileIndex !== undefined) {
       if (files.length === 0) setSelectedFileIndex(undefined);
       else if (selectedFileIndex >= files.length) setSelectedFileIndex(files.length - 1);
    }
  }, [files.length]); // Intentionally not including selectedFileIndex to avoid loops

  const runQueued = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const nextOp = gitOperationQueue.current.then(operation);
    gitOperationQueue.current = nextOp.then(
      () => {},
      () => {} // Continue queue even if operation fails
    );
    return nextOp;
  }, []);

  const withLoading = useCallback(async (message: string, fn: () => Promise<void>) => {
    setIsLoading(true);
    setLoadingMessage(message);
    try {
      await runQueued(fn);
    } finally {
      setIsLoading(false);
      setLoadingMessage(undefined);
    }
  }, [runQueued]);

  const applyTheme = (theme: string) => {
    // Remove theme classes
    document.documentElement.classList.remove('dark');
    
    // Add classes based on theme string
    if (theme.includes('dark')) {
      document.documentElement.classList.add('dark');
    }
  };

  useEffect(() => {
    // Listen for menu events
    if (window.electronAPI) {
       if (window.electronAPI.onShowShortcuts) {
          window.electronAPI.onShowShortcuts(() => {
             setShowShortcutsModal(true);
          });
       }
       
       if (window.electronAPI.onThemeChanged) {
          window.electronAPI.onThemeChanged((theme) => {
             applyTheme(theme);
          });
       }

       if (window.electronAPI.onUpdateAvailable) {
          window.electronAPI.onUpdateAvailable((updateInfo) => {
             toast.info(
                <div className="flex flex-col gap-1">
                   <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">Update Available: {updateInfo.version}</span>
                   </div>
                   <span className="text-xs text-muted-foreground line-clamp-2">
                      {updateInfo.name}
                   </span>
                   <button 
                      onClick={() => window.electronAPI.openExternal(updateInfo.url)}
                      className="mt-2 text-xs font-medium px-2 py-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded w-fit"
                   >
                      View on GitHub
                   </button>
                </div>,
                { duration: 10000, id: 'update-available' }
             );
          });
       }
    }

    const init = async () => {
      try {
        if (window.electronAPI.getTheme) {
           const themeResult = await window.electronAPI.getTheme();
           if (themeResult.success && themeResult.theme) {
              applyTheme(themeResult.theme);
           } else {
              // Fallback
              document.documentElement.classList.add('dark');
           }
        } else {
           // Fallback if API not available yet
           document.documentElement.classList.add('dark');
        }

        const result = await window.electronAPI.getMaxCommits();
        setHistoryLimit(result.success && result.maxCommits ? result.maxCommits : 50);
      } catch (e) {
        console.error('Failed to load settings', e);
      }
      await initApp();
    };
    init();
  }, []);

  useEffect(() => {
    repoPathRef.current = repoPath;
  }, [repoPath]);

  const checkAuthError = (errorMsg: string, silent = false): boolean => {
    if (!errorMsg) return false;
    
    const isAuthError = 
      errorMsg.includes('Authentication failed') || 
      errorMsg.includes('fatal: could not read Username') ||
      errorMsg.includes('fatal: could not read Password') ||
      errorMsg.includes('Permission denied') ||
      errorMsg.includes('401') ||
      errorMsg.includes('403') ||
      errorMsg.includes('Unauthorized');

    if (isAuthError) {
      setHasCredentials(false);
      if (!silent) {
        toast.error(
          <div className="flex flex-col gap-1">
            <span className="font-bold">Authentication Failed</span>
            <span className="text-xs">
              Gitzen relies on your system's git credentials (e.g., SSH keys, GCM). 
              Please use <code>gh auth login</code> or check your credential helper configuration.
            </span>
          </div>,
          { duration: 10000 }
        );
      }
      return true;
    }
    return false;
  };

  const initApp = async () => {
    const path = await loadRepository();
    if (path) {
        await refreshAllData(path);
    }
    // Small delay to ensure smooth transition
    setTimeout(() => setShowSplash(false), 500);
  };

  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs((prev) => [...prev, { timestamp: new Date(), type, message }]);
  };

  const loadRepository = async (): Promise<string | null> => {
    try {
      // 1. Try to get current session repo (e.g. reload)
      const result = await window.electronAPI.getRepoPath();
      if (result.success && result.path) {
        setRepoPath(result.path);
        const nameResult = await window.electronAPI.getRepoName();
        if (nameResult.success && nameResult.name) {
          setRepoName(nameResult.name);
        }
        return result.path;
      }

      // 2. If no current repo, try to open the last recent repo
      const recentResult = await window.electronAPI.getRecentRepos();
      if (recentResult.success && recentResult.repos && recentResult.repos.length > 0) {
        const lastRepo = recentResult.repos[0];
        const openResult = await window.electronAPI.gitOpen(lastRepo.path);
        
        if (openResult.success) {
            setRepoPath(lastRepo.path);
            setRepoName(lastRepo.name);
            return lastRepo.path;
        }
      }
    } catch (error) {
      console.error('Failed to load repository:', error);
    }
    return null;
  };

  const refreshAllData = async (path: string) => {
      // Force update the ref for this operation sequence if needed, but the callbacks handle override
      repoPathRef.current = path; 
      
      await Promise.all([
          refreshStatusInternal(path),
          refreshBranchInternal(path),
          refreshBranchesInternal(path),
          refreshHistoryInternal(path),
          refreshStashesInternal(path),
          refreshBranchStatusInternal(path),
          refreshRebaseStatusInternal(path)
      ]);
  };

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
          const newRemoteBranches = remoteResult.branches.map(b => ({
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
             checkAuthError(result.error, silent);
          }
      } catch (e) {
          console.error('Failed to fetch', e);
          if (e instanceof Error) checkAuthError(e.message, silent);
      }
  }, [repoPath]);

  const performFetch = useCallback((pathOverride?: string, silent = false) => {
    return runQueued(async () => {
      await performFetchInternal(pathOverride, silent);
      // We run these sequentially within the same queued task to ensure consistency
      await refreshBranchStatusInternal(pathOverride || repoPath || undefined);
      await refreshBranchesInternal(pathOverride || repoPath || undefined, silent);
    });
  }, [performFetchInternal, refreshBranchStatusInternal, refreshBranchesInternal, runQueued, repoPath]);

  const refreshHistoryInternal = useCallback(async (pathOverride?: string) => {
      const targetPath = pathOverride || repoPath;
      if (!targetPath) return;
      try {
        const result = await window.electronAPI.gitGetHistory(historyLimit);
        if (!pathOverride && targetPath !== repoPathRef.current) return;
        if (result.success) {
          if (result.commits) {
            setCommits(prev => {
              // Only update if commit IDs have changed or length changed
              // Simple check: compare first and last commit IDs and length
              // For full correctness, we should compare deep, but JSON.stringify on 2000 items is fast enough (~2-5ms)
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

  // Trigger refresh when history limit changes (e.g. Load More button)
  useEffect(() => {
    if (repoPath) {
      refreshHistory();
    }
  }, [historyLimit, refreshHistory, repoPath]);

  const refreshStashesInternal = useCallback(async (pathOverride?: string) => {
      const targetPath = pathOverride || repoPath;
      if (!targetPath) return;
      try {
        const result = await (window.electronAPI as any).getStashes();
        if (!pathOverride && targetPath !== repoPathRef.current) return;
        if (result.success) {
          if (result.stashes) {
            setStashes(prev => {
              if (JSON.stringify(prev) !== JSON.stringify(result.stashes)) {
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

          // If rebase OR cherry-pick is in progress, check for conflicts
          if (rebaseResult.inProgress || cherryPickResult.inProgress) {
              const conflictResult = await window.electronAPI.getConflictedFiles();
              const conflicts = conflictResult.success && conflictResult.files ? conflictResult.files : [];
              setConflictedFiles(conflicts);

              // Rebase specific logic
              if (rebaseResult.inProgress) {
                  const currentStep = rebaseResult.currentStep;
                  const hasConflicts = conflicts.length > 0;

                  if (hasConflicts) {
                      const stepChanged = currentStep !== lastRebaseStepRef.current;
                      const conflictsAppeared = lastConflictCountRef.current === 0;

                      // Show dialog if we're at a new rebase step or if conflicts just appeared
                      if (stepChanged || conflictsAppeared) {
                          setShowMergeConflictDialog(true);
                      }
                  }
                  lastRebaseStepRef.current = currentStep;
              } else if (cherryPickResult.inProgress && conflicts.length > 0 && lastConflictCountRef.current === 0) {
                  // Show dialog for cherry-pick conflicts
                  setShowMergeConflictDialog(true);
              }

              lastConflictCountRef.current = conflicts.length;
          } else {
              // Only reset if we were tracking a rebase to avoid closing dialog during normal merges
              if (lastRebaseStepRef.current !== undefined || lastConflictCountRef.current > 0) {
                  setConflictedFiles([]);
                  setShowMergeConflictDialog(false); // Close dialog if rebase/cherry-pick finished/aborted
                  lastRebaseStepRef.current = undefined;
                  lastConflictCountRef.current = 0;
              }
          }
        }
      } catch (error) {
        console.error('Failed to check rebase/cherry-pick status:', error);
      }
  }, [repoPath]);

  const refreshRebaseStatus = useCallback((pathOverride?: string) => {
    return runQueued(() => refreshRebaseStatusInternal(pathOverride));
  }, [refreshRebaseStatusInternal, runQueued]);

  const refreshBranchesSilent = useCallback(() => refreshBranches(undefined, true), [refreshBranches]);
  const performFetchSilent = useCallback(() => performFetch(undefined, true), [performFetch]);

  // Auto-refresh every 10 seconds when repository is open
  useAutoRefresh({
    enabled: !!repoPath,
    intervalMs: 10000, // 10 seconds
    refreshFunctions: [
      refreshStatus,
      refreshBranch,
      refreshBranchesSilent,
      refreshHistory,
      refreshStashes,
      refreshRebaseStatus,
      refreshBranchStatus,
      performFetchSilent
    ],
  });

  // ... Handlers ...

  const handleCommit = useCallback(async (message: string) => {
    const currentFiles = filesRef.current;
    const stagedFiles = currentFiles.filter((f) => f.staged);
    addLog('info', `Committing ${stagedFiles.length} file(s)...`);

    await withLoading('Committing changes...', async () => {
      try {
        const result = await window.electronAPI.gitCommit(message);
        if (result.success) {
          addLog('success', `Committed: "${message}"`);
          toast.success('Changes committed successfully!');

          // Clear commit message if it was successful
          setCommitMessage('');

          await refreshStatusInternal();
          await refreshHistoryInternal();
          await refreshBranchStatusInternal();
          await refreshBranchesInternal();
        } else {
          addLog('error', result.error || 'Failed to commit');
          toast.error(result.error || 'Failed to commit');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Commit failed: ${errorMsg}`);
        toast.error(`Commit failed: ${errorMsg}`);
      }
    });
  }, [withLoading, refreshStatusInternal, refreshHistoryInternal, refreshBranchStatusInternal, refreshBranchesInternal]);

  // Use the custom hook for keyboard shortcuts
  useKeyboardShortcuts({
    filesRef,
    selectedFileIndexRef,
    commitMessageRef,
    commitMessageTextareaRef,
    setSelectedFileIndex,
    setCommitMessage,
    setShowCreateBranchDialog: setShowCreateBranchDialog,
    setShowShortcutsModal: setShowShortcutsModal,
    setShowLeftPanel: setShowLeftPanel,
    setShowBottomPanel: setShowBottomPanel,
    performFetch,
    handleCommit,
    refreshStatusInternal,
    refreshHistoryInternal,
    refreshBranchStatusInternal,
    refreshBranchesInternal,
    withLoading,
    addLog,
  });

  const handleClone = async (url: string, path: string) => {
    addLog('info', `Cloning repository from ${url}...`);
    setRemoteUrl(url);
    
    await withLoading(`Cloning repository...`, async () => {
      try {
        const result = await window.electronAPI.gitClone(url, path);
        if (result.success) {
          setRepoPath(path);
          setRepoName(url.split('/').pop()?.replace('.git', '') || 'repository');
          setHasCredentials(true);
          addLog('success', `Repository cloned successfully to ${path}`);
          toast.success('Repository cloned successfully!');
          
          await refreshAllData(path);
        } else {
          const errorMsg = result.error || 'Failed to clone repository';
          addLog('error', errorMsg);
          if (!checkAuthError(errorMsg)) {
            toast.error(errorMsg);
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Clone failed: ${errorMsg}`);
        if (!checkAuthError(errorMsg)) {
          toast.error(`Clone failed: ${errorMsg}`);
        }
      }
    });
  };

  const handleStageAll = async () => {
    await withLoading('Staging all files...', async () => {
      try {
        const result = await window.electronAPI.gitStageAll();
        if (result.success) {
          await refreshStatusInternal();
        } else {
          addLog('error', result.error || 'Failed to stage all files');
        }
      } catch (error) {
        addLog('error', `Failed to stage all: ${error}`);
      }
    });
  };

  const handleUnstageAll = async () => {
    await withLoading('Unstaging all files...', async () => {
      try {
        const result = await window.electronAPI.gitUnstageAll();
        if (result.success) {
          await refreshStatusInternal();
        } else {
          addLog('error', result.error || 'Failed to unstage all files');
        }
      } catch (error) {
        addLog('error', `Failed to unstage all: ${error}`);
      }
    });
  };

  const handleToggleStage = async (path: string) => {
    const file = files.find(f => f.path === path);
    if (!file) return;

    await withLoading(file.staged ? 'Unstaging file...' : 'Staging file...', async () => {
      try {
        if (file.staged) {
          const result = await window.electronAPI.gitUnstage([path]);
          if (result.success) {
            await refreshStatusInternal();
          } else {
            addLog('error', result.error || 'Failed to unstage file');
          }
        } else {
          const result = await window.electronAPI.gitStage([path]);
          if (result.success) {
            await refreshStatusInternal();
          } else {
            addLog('error', result.error || 'Failed to stage file');
          }
        }
      } catch (error) {
        addLog('error', `Failed to toggle stage: ${error}`);
      }
    });
  };

  const handleRevertFile = async (path: string) => {
    await withLoading(`Reverting changes to ${path}...`, async () => {
      try {
        const result = await (window.electronAPI as any).revertFileChanges(path);
        if (result.success) {
          addLog('success', `Reverted changes to ${path}`);
          toast.success(`Reverted changes to ${path}`);
          await refreshStatusInternal();
        } else {
          addLog('error', result.error || 'Failed to revert file changes');
          toast.error(result.error || 'Failed to revert file changes');
        }
      } catch (error) {
        addLog('error', `Failed to revert file: ${error}`);
        toast.error('Failed to revert file');
      }
    });
  };

  const handleDeleteFile = async (path: string) => {
    await withLoading(`Deleting file ${path}...`, async () => {
      try {
        const result = await (window.electronAPI as any).deleteFile(path);
        if (result.success) {
          addLog('success', `Deleted file ${path}`);
          toast.success(`Deleted file ${path}`);
          await refreshStatusInternal();
        } else {
          addLog('error', result.error || 'Failed to delete file');
          toast.error(result.error || 'Failed to delete file');
        }
      } catch (error) {
        addLog('error', `Failed to delete file: ${error}`);
        toast.error('Failed to delete file');
      }
    });
  };

  const handleStash = async () => {
    addLog('info', 'Stashing changes...');
    await withLoading('Stashing changes...', async () => {
      try {
        const result = await (window.electronAPI as any).createStash();
        if (result.success) {
          addLog('success', 'Changes stashed successfully');
          toast.success('Changes stashed successfully!');
          await refreshStatusInternal();
          await refreshStashesInternal();
        } else {
          addLog('error', result.error || 'Failed to stash changes');
          toast.error(result.error || 'Failed to stash changes');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Stash failed: ${errorMsg}`);
        toast.error(`Stash failed: ${errorMsg}`);
      }
    });
  };

  const handleApplyStash = async (name: string) => {
    addLog('info', `Applying stash ${name}...`);
    await withLoading(`Applying stash ${name}...`, async () => {
      try {
        const result = await (window.electronAPI as any).applyStash(name);
        if (result.success) {
          addLog('success', `Stash ${name} applied successfully`);
          toast.success(`Stash ${name} applied successfully!`);
          await refreshStatusInternal();
          await refreshStashesInternal();
        } else {
          addLog('error', result.error || 'Failed to apply stash');
          toast.error(result.error || 'Failed to apply stash');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Apply stash failed: ${errorMsg}`);
        toast.error(`Apply stash failed: ${errorMsg}`);
      }
    });
  };

  const handleDeleteStash = async (name: string) => {
    addLog('info', `Deleting stash ${name}...`);
    await withLoading(`Deleting stash ${name}...`, async () => {
      try {
        const result = await (window.electronAPI as any).deleteStash(name);
        if (result.success) {
          addLog('success', `Stash ${name} deleted successfully`);
          toast.success(`Stash ${name} deleted successfully!`);
          await refreshStashesInternal();
        } else {
          addLog('error', result.error || 'Failed to delete stash');
          toast.error(result.error || 'Failed to delete stash');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Delete stash failed: ${errorMsg}`);
        toast.error(`Delete stash failed: ${errorMsg}`);
      }
    });
  };

  const handleAddRemote = async (name: string, url: string) => {
    await withLoading(`Adding remote ${name}...`, async () => {
      try {
        const result = await window.electronAPI.gitAddRemote(name, url);
        if (result.success) {
          addLog('success', `Remote ${name} added successfully`);
          toast.success(`Remote ${name} added successfully`);
          setRemoteUrl(url);
          // Try to fetch to set up tracking if possible, or just refresh
          await refreshBranchStatusInternal();
        } else {
          addLog('error', result.error || 'Failed to add remote');
          toast.error(result.error || 'Failed to add remote');
        }
      } catch (error) {
        addLog('error', `Failed to add remote: ${error}`);
      }
    });
  };

  const handlePull = async () => {
    addLog('info', `Pulling from origin/${currentBranch}...`);
    await withLoading(`Pulling from origin/${currentBranch}...`, async () => {
      try {
        const result = await window.electronAPI.gitPull('origin', currentBranch);
        if (result.success) {
          setHasCredentials(true);
          addLog('success', `Successfully pulled from origin/${currentBranch}`);
          toast.success('Pulled successfully!');
          await refreshStatusInternal();
          await refreshHistoryInternal();
          await refreshBranchStatusInternal();
        } else {
          const errorMsg = result.error || 'Failed to pull';
          addLog('error', errorMsg);
          if (!checkAuthError(errorMsg)) {
            toast.error(errorMsg);
          }
        }
      } catch (error) {
         const errorMsg = error instanceof Error ? error.message : 'Unknown error';
         addLog('error', `Pull failed: ${errorMsg}`);
         if (!checkAuthError(errorMsg)) {
            toast.error(`Pull failed: ${errorMsg}`);
         }
      }
    });
  };

  const handlePush = async () => {
    // Check if we have a remote
    if (!remoteUrl) {
      // Check if we can get it from git
      try {
        const remoteResult = await window.electronAPI.getRemoteUrl('origin');
        if (!remoteResult.success || !remoteResult.url) {
           setShowAddRemoteDialog(true);
           return;
        }
        setRemoteUrl(remoteResult.url);
      } catch (e) {
        setShowAddRemoteDialog(true);
        return;
      }
    }

    addLog('info', `Pushing to origin/${currentBranch}...`);
    
    await withLoading(`Pushing to origin/${currentBranch}...`, async () => {
      try {
        const result = await window.electronAPI.gitPush('origin', currentBranch);
        if (result.success) {
          setHasCredentials(true);
          addLog('success', `Successfully pushed to origin/${currentBranch}`);
          toast.success('Changes pushed successfully!');
          await refreshBranchStatusInternal();
        } else {
          const errorMsg = result.error || 'Failed to push';
          if (checkAuthError(errorMsg)) {
            addLog('error', errorMsg);
            return;
          }
          
          if (errorMsg.includes('Updates were rejected') || 
              errorMsg.includes('non-fast-forward') || 
              errorMsg.includes('failed to push some refs') ||
              errorMsg.includes('fetch first')) {
             setShowForcePushDialog(true);
             addLog('warning', 'Push failed: Remote contains work that you do not have locally. Force push may be required.');
             return; 
          }

          addLog('error', errorMsg);
          toast.error(errorMsg);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Push failed: ${errorMsg}`);
        if (!checkAuthError(errorMsg)) {
          toast.error(`Push failed: ${errorMsg}`);
        }
      }
    });
  };

  const handleForcePush = async (overwrite: boolean = false) => {
    addLog('warning', `${overwrite ? 'Force' : 'Force-with-lease'} pushing to origin/${currentBranch}...`);
    await withLoading(`${overwrite ? 'Force' : 'Force-with-lease'} pushing to origin/${currentBranch}...`, async () => {
      try {
        const result = await window.electronAPI.gitPush('origin', currentBranch, true, overwrite);
        if (result.success) {
          setHasCredentials(true);
          addLog('success', `Successfully ${overwrite ? 'force' : 'force-with-lease'} pushed to origin/${currentBranch}`);
          toast.success(`Changes ${overwrite ? 'force' : 'force-with-lease'} pushed successfully!`);
          await refreshBranchStatusInternal();
        } else {
          const errorMsg = result.error || 'Failed to force push';
          addLog('error', errorMsg);
          if (!checkAuthError(errorMsg)) {
            toast.error(errorMsg);
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Force push failed: ${errorMsg}`);
        if (!checkAuthError(errorMsg)) {
          toast.error(`Force push failed: ${errorMsg}`);
        }
      }
    });
  };

  const handleAbortRebase = async () => {
    await withLoading('Aborting rebase...', async () => {
      try {
          const result = await window.electronAPI.gitAbortRebase();
          if (result.success) {
              toast.success('Rebase aborted');
              addLog('info', 'Rebase aborted');
              await refreshRebaseStatusInternal();
              await refreshStatusInternal();
              await refreshHistoryInternal();
              await refreshBranchInternal();
          } else {
              toast.error(result.error || 'Failed to abort rebase');
          }
      } catch (error: any) {
          toast.error(`Failed to abort rebase: ${error.message}`);
      }
    });
  };

  const handleContinueRebase = async () => {
      // Check for conflicts first
      const conflictResult = await window.electronAPI.getConflictedFiles();
      if (conflictResult.success && conflictResult.files && conflictResult.files.length > 0) {
          setConflictedFiles(conflictResult.files);
          setShowMergeConflictDialog(true);
          toast.warning('Please resolve conflicts before continuing');
          return;
      }

      await withLoading('Continuing rebase...', async () => {
        try {
            const result = await window.electronAPI.gitContinueRebase();
            if (result.success) {
                toast.success('Rebase continued');
                addLog('info', 'Rebase continued');
                await refreshRebaseStatusInternal();
                await refreshStatusInternal();
                await refreshHistoryInternal();
                await refreshBranchInternal();
            } else {
               if (result.error && (result.error.includes('conflict') || result.error.includes('resolve'))) {
                   toast.warning('Rebase paused due to conflicts');
                   await refreshRebaseStatusInternal();
                   await refreshStatusInternal(); // To show conflicted files
               } else {
                   toast.error(result.error || 'Failed to continue rebase');
               }
            }
        } catch (error: any) {
            toast.error(`Failed to continue rebase: ${error.message}`);
        }
      });
  };

  const handleCherryPick = async (commitHash: string) => {
    addLog('info', `Cherry-picking commit ${commitHash.substring(0, 7)}...`);
    await withLoading(`Cherry-picking ${commitHash.substring(0, 7)}...`, async () => {
      try {
        const result = await window.electronAPI.gitCherryPick(commitHash);
        if (result.success) {
          toast.success(`Successfully cherry-picked ${commitHash.substring(0, 7)}`);
          addLog('success', `Cherry-picked ${commitHash.substring(0, 7)}`);
          if (repoPath) await refreshAllData(repoPath);
        } else {
          const errorMsg = result.error || 'Failed to cherry-pick';
          if (errorMsg.includes('conflict')) {
             toast.warning('Cherry-pick conflict detected');
             addLog('warning', 'Cherry-pick conflict detected. Please resolve conflicts.');
             await refreshRebaseStatusInternal(); // This updates conflicts too
             await refreshStatusInternal(); 
          } else {
             toast.error(errorMsg);
             addLog('error', errorMsg);
          }
        }
      } catch (error: any) {
        const msg = error.message || 'Unknown error';
        toast.error(`Cherry-pick failed: ${msg}`);
        addLog('error', `Cherry-pick failed: ${msg}`);
      }
    });
  };

  const handleAbortCherryPick = async () => {
    await withLoading('Aborting cherry-pick...', async () => {
      try {
        const result = await window.electronAPI.gitAbortCherryPick();
        if (result.success) {
          toast.success('Cherry-pick aborted');
          addLog('info', 'Cherry-pick aborted');
          if (repoPath) await refreshAllData(repoPath);
        } else {
          toast.error(result.error || 'Failed to abort cherry-pick');
        }
      } catch (error: any) {
        toast.error(`Failed to abort cherry-pick: ${error.message}`);
      }
    });
  };

  const handleContinueCherryPick = async () => {
      // Check for conflicts first
      const conflictResult = await window.electronAPI.getConflictedFiles();
      if (conflictResult.success && conflictResult.files && conflictResult.files.length > 0) {
          setConflictedFiles(conflictResult.files);
          setShowMergeConflictDialog(true);
          toast.warning('Please resolve conflicts before continuing');
          return;
      }

      await withLoading('Continuing cherry-pick...', async () => {
        try {
            const result = await window.electronAPI.gitContinueCherryPick();
            if (result.success) {
                toast.success('Cherry-pick continued');
                addLog('info', 'Cherry-pick continued');
                if (repoPath) await refreshAllData(repoPath);
            } else {
               if (result.error && (result.error.includes('conflict') || result.error.includes('resolve'))) {
                   toast.warning('Cherry-pick paused due to conflicts');
                   await refreshRebaseStatusInternal();
                   await refreshStatusInternal();
               } else {
                   toast.error(result.error || 'Failed to continue cherry-pick');
               }
            }
        } catch (error: any) {
            toast.error(`Failed to continue cherry-pick: ${error.message}`);
        }
      });
  };

  const handleSkipCherryPick = async () => {
    await withLoading('Skipping cherry-pick step...', async () => {
      try {
        const result = await window.electronAPI.gitSkipCherryPick();
        if (result.success) {
          toast.success('Cherry-pick step skipped');
          addLog('info', 'Cherry-pick step skipped');
          if (repoPath) await refreshAllData(repoPath);
        } else {
          toast.error(result.error || 'Failed to skip cherry-pick step');
        }
      } catch (error: any) {
        toast.error(`Failed to skip cherry-pick step: ${error.message}`);
      }
    });
  };

  const handleMergeBranch = async (branch: string) => {
    addLog('info', `Merging ${branch} into ${currentBranch}...`);
    
    await withLoading(`Merging ${branch}...`, async () => {
      try {
        const result = await window.electronAPI.gitMergeBranchToCurrent(branch);
        
        if (result.success) {
          toast.success(`Successfully merged ${branch} into ${currentBranch}`);
          addLog('success', `Merged ${branch} into ${currentBranch}`);
          
          await refreshStatusInternal();
          await refreshBranchInternal();
          await refreshHistoryInternal();
          await refreshBranchesInternal();
        } else if (result.hasConflicts && result.conflictedFiles) {
          setConflictedFiles(result.conflictedFiles);
          setShowMergeConflictDialog(true);
          toast.warning(`Merge conflict: ${result.conflictedFiles.length} file(s) have conflicts`);
          addLog('warning', `Merge conflict: ${result.conflictedFiles.length} file(s) need to be resolved`);
        } else {
          toast.error(result.error || 'Merge failed');
          addLog('error', `Merge failed: ${result.error || 'Unknown error'}`);
        }
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error';
        toast.error(`Failed to merge: ${errorMessage}`);
        addLog('error', `Merge error: ${errorMessage}`);
      }
    });
  };

  const handleOpenFileInMergeTool = async (filePath: string) => {
    await withLoading('Opening merge tool...', async () => {
      try {
        const result = await window.electronAPI.openFileInMergeTool(filePath);
        if (result.success) {
          addLog('info', `Opened ${filePath} in merge tool`);
        } else if (result.error === 'NO_MERGE_TOOL_CONFIGURED') {
          toast.info('No merge tool configured. Please select one in settings.');
          setShowSettingsDialog(true);
        } else {
          toast.error(`Failed to open file: ${result.error}`);
          addLog('error', `Failed to open ${filePath}: ${result.error}`);
        }
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error';
        toast.error(`Failed to open file: ${errorMessage}`);
        addLog('error', `Failed to open ${filePath}: ${errorMessage}`);
      }
    });
  };

  const handleAbortMerge = async () => {
    await withLoading('Aborting merge...', async () => {
      try {
        const result = await window.electronAPI.abortMerge();
        if (result.success) {
          toast.success('Merge aborted successfully');
          addLog('info', 'Merge aborted');
          setShowMergeConflictDialog(false);
          setConflictedFiles([]);
          
          await refreshStatusInternal();
          await refreshBranchInternal();
          await refreshHistoryInternal();
        } else {
          toast.error(result.error || 'Failed to abort merge');
          addLog('error', `Failed to abort merge: ${result.error || 'Unknown error'}`);
        }
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error';
        toast.error(`Failed to abort merge: ${errorMessage}`);
        addLog('error', `Failed to abort merge: ${errorMessage}`);
      }
    });
  };

  const handleResolveFiles = async (filePaths: string[]) => {
    await withLoading(`Marking ${filePaths.length} file(s) as resolved...`, async () => {
      try {
        const result = await window.electronAPI.gitStage(filePaths);
        if (result.success) {
          toast.success(`Marked ${filePaths.length} file(s) as resolved`);
          addLog('success', `Resolved ${filePaths.length} conflicted file(s)`);
          
          const conflictedResult = await window.electronAPI.getConflictedFiles();
          if (conflictedResult.success && conflictedResult.files) {
            setConflictedFiles(conflictedResult.files);
            
            if (conflictedResult.files.length === 0) {
              toast.success('All conflicts resolved! You can now complete the merge.');
              addLog('success', 'All merge conflicts have been resolved');
            }
          }
          
          await refreshStatusInternal();
        } else {
          toast.error(result.error || 'Failed to mark files as resolved');
          addLog('error', `Failed to resolve files: ${result.error || 'Unknown error'}`);
        }
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error';
        toast.error(`Failed to resolve files: ${errorMessage}`);
        addLog('error', `Failed to resolve files: ${errorMessage}`);
      }
    });
  };

  const handleResolveConflict = async (filePath: string, decision: 'keep' | 'delete') => {
    await withLoading(`Resolving conflict for ${filePath}...`, async () => {
      try {
        const result = await window.electronAPI.resolveConflict(filePath, decision);
        if (result.success) {
          toast.success(`Resolved conflict for ${filePath}`);
          addLog('success', `Resolved conflict: ${decision} ${filePath}`);

          const conflictedResult = await window.electronAPI.getConflictedFiles();
          if (conflictedResult.success && conflictedResult.files) {
            setConflictedFiles(conflictedResult.files);
            
            if (conflictedResult.files.length === 0) {
              toast.success('All conflicts resolved! You can now complete the merge.');
              addLog('success', 'All merge conflicts have been resolved');
            }
          }
          await refreshStatusInternal();
        } else {
          toast.error(result.error || 'Failed to resolve conflict');
          addLog('error', `Failed to resolve conflict: ${result.error || 'Unknown error'}`);
        }
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error';
        toast.error(`Failed to resolve conflict: ${errorMessage}`);
        addLog('error', `Failed to resolve conflict: ${errorMessage}`);
      }
    });
  };

  const handleSwitchRepo = async (name: string, path: string) => {
    setRemoteUrl(null);
    setFiles([]);
    setCommits([]);
    addLog('info', `Switching to repository: ${name}...`);
    
    await handleOpenRepo(path);
  };

  const handleOpenNewRepo = () => {
    setRepoName(null);
    setRepoPath(null);
    setFiles([]);
    setCommits([]);
    setHistoryLimit(50);
    setRemoteUrl(null);
    setActiveTab('clone');
    addLog('info', 'Ready to open a new repository');
  };

  const handleCheckout = async (branch: string) => {
    setCommits([]); // Clear commits to avoid showing stale graph during switch
    await withLoading(`Switching to branch ${branch}...`, async () => {
      try {
        const result = await window.electronAPI.gitCheckoutBranch(branch);
        if (result.success) {
          addLog('success', `Switched to branch ${branch}`);
          setCurrentBranch(branch);
          // Refresh everything
          await Promise.all([
            refreshBranchInternal(),
            refreshStatusInternal(),
            refreshHistoryInternal(),
            refreshStashesInternal(),
            refreshBranchStatusInternal(),
            refreshRebaseStatusInternal(),
            refreshBranchesInternal()
          ]);
        } else {
          addLog('error', result.error || 'Failed to checkout branch');
          toast.error(result.error || 'Failed to checkout branch');
          // If failed, reload history to restore graph
          await refreshHistoryInternal();
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Checkout failed: ${msg}`);
        toast.error(`Checkout failed: ${msg}`);
        await refreshHistoryInternal();
      }
    });
  };

  const handleCreateBranch = async (name: string) => {
    await withLoading(`Creating branch ${name}...`, async () => {
      try {
        const result = await window.electronAPI.gitCreateBranch(name, true);
        if (result.success) {
          addLog('success', `Created and checked out branch: ${name}`);
          setCurrentBranch(name);
          await Promise.all([
            refreshBranchInternal(),
            refreshStatusInternal(),
            refreshHistoryInternal(),
            refreshStashesInternal(),
            refreshBranchStatusInternal(),
            refreshRebaseStatusInternal(),
            refreshBranchesInternal()
          ]);
        } else {
          addLog('error', result.error || 'Failed to create branch');
          toast.error(result.error || 'Failed to create branch');
        }
      } catch (error) {
        addLog('error', `Failed to create branch: ${error}`);
      }
    });
  };

  const handleDeleteBranch = async (branch: string) => {
    await withLoading(`Deleting branch ${branch}...`, async () => {
      try {
        const result = await window.electronAPI.deleteBranch(branch);
        if (result.success) {
          addLog('success', `Deleted branch ${branch}`);
          toast.success(`Deleted branch ${branch}`);
          await refreshBranchesInternal();
        } else {
          addLog('error', result.error || 'Failed to delete branch');
          toast.error(result.error || 'Failed to delete branch');
        }
      } catch (error) {
        addLog('error', `Failed to delete branch: ${error}`);
      }
    });
  };

  const handleRevertCommit = async (commitHash: string) => {
    addLog('info', `Reverting commit ${commitHash.substring(0, 7)}...`);
    await withLoading(`Reverting commit ${commitHash.substring(0, 7)}...`, async () => {
      try {
        const result = await window.electronAPI.gitRevertCommit(commitHash);
        if (result.success) {
          toast.success(`Successfully reverted commit ${commitHash.substring(0, 7)}`);
          addLog('success', `Reverted commit ${commitHash.substring(0, 7)}`);
          await refreshStatusInternal();
          await refreshHistoryInternal();
        } else {
          const errorMsg = result.error || 'Failed to revert commit';
          if (errorMsg.includes('conflict')) {
             toast.warning('Revert conflict detected');
             addLog('warning', 'Revert conflict detected. Please resolve conflicts.');
             
             // Check for conflicts explicitly to update UI state
             const conflictResult = await window.electronAPI.getConflictedFiles();
             if (conflictResult.success && conflictResult.files && conflictResult.files.length > 0) {
                 setConflictedFiles(conflictResult.files);
                 setShowMergeConflictDialog(true);
             }
             
             await refreshStatusInternal();
          } else {
             toast.error(errorMsg);
             addLog('error', errorMsg);
          }
        }
      } catch (error: any) {
        const msg = error.message || 'Unknown error';
        toast.error(`Revert failed: ${msg}`);
        addLog('error', `Revert failed: ${msg}`);
      }
    });
  };

  const handleResetCommits = (commitHash: string) => {
    setResetTargetCommit(commitHash);
    setShowResetDialog(true);
  };

  const handleConfirmReset = async (mode: 'soft' | 'mixed' | 'hard') => {
    if (!resetTargetCommit) return;
    
    const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);
    addLog('warning', `${modeLabel} resetting to ${resetTargetCommit.substring(0, 7)}...`);
    
    setShowResetDialog(false);
    
    await withLoading(`${modeLabel} resetting branch...`, async () => {
      try {
        const result = await window.electronAPI.gitResetCommits(resetTargetCommit, mode);
        if (result.success) {
          toast.success(`Successfully reset branch to ${resetTargetCommit.substring(0, 7)}`);
          addLog('success', `Reset branch (${mode}) to ${resetTargetCommit.substring(0, 7)}`);
          setResetTargetCommit(null);
          
          await refreshStatusInternal();
          await refreshHistoryInternal();
          await refreshBranchStatusInternal();
        } else {
          toast.error(result.error || 'Failed to reset branch');
          addLog('error', result.error || 'Failed to reset branch');
        }
      } catch (error: any) {
        const msg = error.message || 'Unknown error';
        toast.error(`Reset failed: ${msg}`);
        addLog('error', `Reset failed: ${msg}`);
      }
    });
  };

  const handleOpenRepo = async (path: string) => {
    addLog('info', `Opening repository from ${path}...`);
    
    // Clear all state before opening
    setFiles([]);
    setCommits([]);

    // Reset history limit to default or user setting when opening new repo
    try {
      const result = await window.electronAPI.getMaxCommits();
      setHistoryLimit(result.success && result.maxCommits ? result.maxCommits : 50);
    } catch (e) {
      setHistoryLimit(50);
    }

    setStashes([]);
    setBranchStatus(undefined);
    setRebaseStatus({ inProgress: false });
    setConflictedFiles([]);
    setShowMergeConflictDialog(false);
    setRemoteUrl(null);
    
    await withLoading(`Opening repository...`, async () => {
      try {
        const result = await window.electronAPI.gitOpen(path);
        if (result.success) {
          setRepoPath(path);
          const nameResult = await window.electronAPI.getRepoName();
          if (nameResult.success && nameResult.name) {
            setRepoName(nameResult.name);
          } else {
            setRepoName(path.split(/[/\\]/).pop() || 'repository');
          }
          
          addLog('success', `Repository opened successfully from ${path}`);
          toast.success('Repository opened successfully!');
          
          try {
            const remoteResult = await window.electronAPI.getRemoteUrl('origin');
            if (remoteResult.success && remoteResult.url) {
              setRemoteUrl(remoteResult.url);
            }
          } catch (error) {
            console.log('No remote configured for this repository');
          }
          
          await refreshAllData(path);
        } else {
          addLog('error', result.error || 'Failed to open repository');
          toast.error(result.error || 'Failed to open repository');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Failed to open repository: ${errorMsg}`);
        toast.error(`Failed to open repository: ${errorMsg}`);
      }
    });
  };

  return (
    <div className="h-screen bg-background text-foreground p-4 flex flex-col gap-4">
      <SplashScreen visible={showSplash} />
      {isLoading && <LoadingOverlay message={loadingMessage} />}
      
      <div className="flex-none">
        <RepoHeader
          repoName={repoName}
          currentBranch={currentBranch}
          hasCredentials={hasCredentials}
          branchStatus={branchStatus}
          isDisabled={isRefreshingBranches}
          canStash={files.length > 0}
          onSwitchRepo={handleSwitchRepo}
          onOpenNew={handleOpenNewRepo}
          onOpenSettings={() => setShowSettingsDialog(true)}
          onPush={handlePush}
          onPull={handlePull}
          onStash={handleStash}
        />
      </div>
                
      {rebaseStatus.inProgress && (
        <div className="flex-none bg-secondary border border-border rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="size-2 rounded-full bg-primary animate-pulse" />
                    <span className="font-medium text-foreground">
                        Rebase in progress
                        {rebaseStatus.totalSteps ? ` (Step ${rebaseStatus.currentStep} of ${rebaseStatus.totalSteps})` : ''}
                    </span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleAbortRebase}
                        className="px-3 py-1.5 text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-md transition-colors"
                    >
                        Abort
                    </button>
                    <button
                        onClick={handleContinueRebase}
                        className="px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-md transition-colors"
                    >
                        Continue
                    </button>
                </div>
            </div>
        )}

        {cherryPickStatus.inProgress && (
          <div className="flex-none bg-secondary border border-border rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="size-2 rounded-full bg-primary animate-pulse" />
                    <span className="font-medium text-foreground">
                        Cherry-pick in progress
                    </span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleSkipCherryPick}
                        className="px-3 py-1.5 text-xs font-medium bg-zinc-500/10 text-muted-foreground hover:bg-zinc-500/20 border border-border/20 rounded-md transition-colors"
                    >
                        Skip
                    </button>
                    <button
                        onClick={handleAbortCherryPick}
                        className="px-3 py-1.5 text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-md transition-colors"
                    >
                        Abort
                    </button>
                    <button
                        onClick={handleContinueCherryPick}
                        className="px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-md transition-colors"
                    >
                        Continue
                    </button>
                </div>
            </div>
        )}

        <div className="flex-1 min-h-dvh max-h-dvh">
          <div className="grid grid-cols-5 gap-4 h-full min-h-0">
            {/* Left Sidebar - Branches & Tags (20%) */}
            {repoName && showLeftPanel && (
              <div className="col-span-1 flex flex-col gap-4 h-full overflow-y-auto min-h-0">
                <BranchesPanel
                  currentBranch={currentBranch}
                  localBranches={localBranches}
                  remoteBranches={remoteBranches}
                  stashes={stashes}
                  loading={isRefreshingBranches}
                  onCheckout={handleCheckout}
                  onCreateBranch={handleCreateBranch}
                  onDeleteBranch={handleDeleteBranch}
                  onMergeBranch={handleMergeBranch}
                  onSetLoading={(loading, message) => {
                    setIsLoading(loading);
                    setLoadingMessage(message);
                  }}
                  onApplyStash={handleApplyStash}
                  onDeleteStash={handleDeleteStash}
                  onRefresh={() => repoPath && refreshAllData(repoPath)}
                  isCreateDialogOpen={showCreateBranchDialog}
                  onCloseCreateDialog={() => setShowCreateBranchDialog(false)}
                  onOpenCreateDialog={() => setShowCreateBranchDialog(true)}
                />
                <TagsPanel
                  onSetLoading={(loading, message) => {
                    setIsLoading(loading);
                    setLoadingMessage(message);
                  }}
                />
              </div>
            )}

            {/* Main Content Area - Graph or Repo Selector */}
            <div className={`${repoName && showLeftPanel ? 'col-span-4' : 'col-span-5'} flex flex-col gap-4 h-full min-h-0`}>
              {!repoName ? (
                <div className="rounded-lg border border-border bg-card/50 overflow-hidden h-full">
                  <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'clone' | 'open')} className="h-full flex flex-col">
                    <TabsList className="grid w-full grid-cols-2 bg-card/50 border-b border-border rounded-none flex-none">
                      <TabsTrigger 
                        value="clone" 
                        className="data-[state=active]:bg-secondary/50 data-[state=active]:border-b-2 data-[state=active]:border-emerald-500"
                      >
                        Clone Repository
                      </TabsTrigger>
                      <TabsTrigger 
                        value="open"
                        className="data-[state=active]:bg-secondary/50 data-[state=active]:border-b-2 data-[state=active]:border-blue-500"
                      >
                        Open Repository
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="clone" className="p-6 m-0 flex-1 overflow-y-auto">
                      <CloneRepo onClone={handleClone} />
                    </TabsContent>
                    <TabsContent value="open" className="p-6 m-0 flex-1 overflow-y-auto">
                      <OpenRepo onOpen={handleOpenRepo} />
                    </TabsContent>
                  </Tabs>
                </div>
              ) : (
                <CommitGraph
                  commits={commits}
                  currentBranch={currentBranch}
                  hasMore={hasMoreCommits}
                  onStashAction={refreshHistory}
                  onLoadMore={(amount) => setHistoryLimit(prev => Math.min(prev + amount, 2000))}
                  onCherryPick={handleCherryPick}
                  onRevertCommit={handleRevertCommit}
                  onResetCommits={handleResetCommits}
                />
              )}
            </div>
          </div>
        </div>

        {repoName && showBottomPanel ? (
          <div className="flex-none grid grid-cols-2 gap-4 h-auto min-h-0">
            <div className="min-h-0">
              <CommitPanel
                ref={commitMessageTextareaRef}
                files={files}
                onToggleStage={handleToggleStage}
                onStageAll={handleStageAll}
                onUnstageAll={handleUnstageAll}
                onCommit={handleCommit}
                onRevertFile={handleRevertFile}
                onDeleteFile={handleDeleteFile}
                onRefresh={() => refreshStatus()}
                commitMessage={commitMessage}
                onCommitMessageChange={setCommitMessage}
                selectedFileIndex={selectedFileIndex}
              />
            </div>
            <div className="h-0 min-h-full">
              <ActivityLog logs={logs} />
            </div>
          </div>
        ) : !repoName ? (
          <div className="flex-none h-auto">
            <ActivityLog logs={logs} />
          </div>
        ) : null}

      <AddRemoteDialog
        open={showAddRemoteDialog}
        onClose={() => setShowAddRemoteDialog(false)}
        onAddRemote={handleAddRemote}
      />

      <MergeConflictDialog
        open={showMergeConflictDialog}
        conflictedFiles={conflictedFiles}
        onOpenFile={handleOpenFileInMergeTool}
        onAbortMerge={handleAbortMerge}
        onResolveFiles={handleResolveFiles}
        onResolveConflict={handleResolveConflict}
        onClose={() => setShowMergeConflictDialog(false)}
      />

      <SettingsDialog
        open={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
      />

      <ForcePushDialog
        open={showForcePushDialog}
        onClose={() => setShowForcePushDialog(false)}
        onConfirm={handleForcePush}
        targetBranch={currentBranch}
      />

      <ShortcutsModal
        open={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Reset Branch</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Choose how you want to reset the current branch to this commit.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={() => handleConfirmReset('soft')}
                className="flex flex-col items-start gap-1 p-4 rounded-lg border border-border bg-card/50 hover:bg-accent transition-colors text-left"
              >
                <span className="font-semibold text-foreground">Soft Reset</span>
                <span className="text-xs text-muted-foreground">
                  Keeps all changes in the staging area (Index). Useful if you want to recommit changes.
                </span>
              </button>
              <button
                onClick={() => handleConfirmReset('mixed')}
                className="flex flex-col items-start gap-1 p-4 rounded-lg border border-border bg-card/50 hover:bg-accent transition-colors text-left"
              >
                <span className="font-semibold text-foreground">Mixed Reset (Default)</span>
                <span className="text-xs text-muted-foreground">
                  Keeps changes in Working Directory but unstages them.
                </span>
              </button>
              <button
                onClick={() => handleConfirmReset('hard')}
                className="flex flex-col items-start gap-1 p-4 rounded-lg border border-red-900/30 bg-red-950/10 hover:bg-red-900/20 transition-colors text-left"
              >
                <span className="font-semibold text-red-400">Hard Reset</span>
                <span className="text-xs text-red-300/70">
                  DISCARDS all changes. Resets Index and Working Directory to match the commit. Any uncommitted changes will be lost.
                </span>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Toaster visibleToasts={1} richColors />
    </div>
  );
}
