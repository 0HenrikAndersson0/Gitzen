import { useState, useEffect, useCallback, useRef } from 'react';
import { CloneRepo } from './components/CloneRepo';
import { OpenRepo } from './components/OpenRepo';
import { CommitPanel } from './components/CommitPanel';
import { ActivityLog } from './components/ActivityLog';
import { AddRemoteDialog } from './components/AddRemoteDialog';
import { RepoHeader } from './components/RepoHeader';
import { CredentialsDialog } from './components/CredentialsDialog';
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
  const [hasCredentials, setHasCredentials] = useState(false);
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [showAddRemoteDialog, setShowAddRemoteDialog] = useState(false);
  const [showForcePushDialog, setShowForcePushDialog] = useState(false);
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
  const [conflictedFiles, setConflictedFiles] = useState<ConflictedFile[]>([]);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [rebaseStatus, setRebaseStatus] = useState<{ inProgress: boolean; currentStep?: number; totalSteps?: number }>({ inProgress: false });
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | undefined>(undefined);
  const [pendingClone, setPendingClone] = useState<{ url: string; path: string } | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  
  // UI Layout State
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);

  const lastRebaseStepRef = useRef<number | undefined>(undefined);
  const lastConflictCountRef = useRef<number>(0);
  const repoPathRef = useRef<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey) {
        switch (e.key) {
          case 'ArrowUp':
            e.preventDefault();
            // Maximize graph: Hide both panels
            setShowLeftPanel(false);
            setShowBottomPanel(false);
            toast.info('Maximized Git Graph');
            break;
          case 'ArrowLeft':
            e.preventDefault();
            setShowLeftPanel(prev => {
              const newState = !prev;
              toast.info(newState ? 'Shown Left Panel' : 'Hidden Left Panel');
              return newState;
            });
            break;
          case 'ArrowDown':
            e.preventDefault();
            setShowBottomPanel(prev => {
              const newState = !prev;
              toast.info(newState ? 'Shown Bottom Panel' : 'Hidden Bottom Panel');
              return newState;
            });
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    const init = async () => {
      try {
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

  const withLoading = async (message: string, fn: () => Promise<void>) => {
    setIsLoading(true);
    setLoadingMessage(message);
    try {
      await fn();
    } finally {
      setIsLoading(false);
      setLoadingMessage(undefined);
    }
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
          refreshStatus(path),
          refreshBranch(path),
          refreshBranches(path),
          refreshHistory(path),
          refreshStashes(path),
          refreshBranchStatus(path),
          refreshRebaseStatus(path)
      ]);
  };

  const refreshStatus = useCallback(async (pathOverride?: string) => {
    const targetPath = pathOverride || repoPath;
    if (!targetPath) return;
    try {
      const result = await window.electronAPI.gitStatus();
      if (!pathOverride && targetPath !== repoPathRef.current) return;
      if (result.success && result.files) {
        setFiles(result.files);
      }
    } catch (error) {
      console.error('Failed to refresh status:', error);
    }
  }, [repoPath]);

  const refreshBranch = useCallback(async (pathOverride?: string) => {
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

  const refreshBranches = useCallback(async (pathOverride?: string) => {
    const targetPath = pathOverride || repoPath;
    if (!targetPath) return;
    setIsRefreshingBranches(true);
    try {
      const [localResult, remoteResult] = await Promise.all([
        window.electronAPI.gitGetBranchesDetailed(),
        window.electronAPI.getRemoteBranches(),
      ]);
      
      if (!pathOverride && targetPath !== repoPathRef.current) return;

      if (localResult.success && localResult.branches) {
        setLocalBranches(localResult.branches.map((b: any) => ({
            name: b.name, 
            isRemote: false, 
            isCurrent: b.current,
            ahead: b.ahead,
            behind: b.behind,
            upstream: b.upstream
        })));
      }
      if (remoteResult.success && remoteResult.branches) {
        setRemoteBranches(remoteResult.branches.map(b => ({
            name: `${b.remote}/${b.name}`, isRemote: true, isCurrent: false
        })));
      }
    } catch (e) {
        console.error('Failed to refresh branches', e);
    } finally {
        if (targetPath === repoPathRef.current) {
             setIsRefreshingBranches(false);
        }
    }
  }, [repoPath, currentBranch]);

  const refreshBranchStatus = useCallback(async (pathOverride?: string) => {
    const targetPath = pathOverride || repoPath;
    if (!targetPath) return;
    try {
      const result = await window.electronAPI.gitGetBranchStatus();
      if (!pathOverride && targetPath !== repoPathRef.current) return;
      if (result.success) {
        setBranchStatus({
          ahead: result.ahead || 0,
          behind: result.behind || 0,
          hasUpstream: !!result.hasUpstream,
          upstream: result.upstream
        });
      }
    } catch (error) {
      console.error('Failed to refresh branch status:', error);
    }
  }, [repoPath]);

  const performFetch = useCallback(async (pathOverride?: string) => {
      const targetPath = pathOverride || repoPath;
      if (!targetPath) return;
      try {
          await window.electronAPI.gitFetchAll();
          await refreshBranchStatus(targetPath);
          await refreshBranches(targetPath);
      } catch (e) {
          console.error('Failed to fetch', e);
      }
  }, [repoPath, refreshBranchStatus, refreshBranches]);

  const refreshHistory = useCallback(async (pathOverride?: string) => {
    const targetPath = pathOverride || repoPath;
    if (!targetPath) return;
    try {
      const result = await window.electronAPI.gitGetHistory(historyLimit);
      if (!pathOverride && targetPath !== repoPathRef.current) return;
      if (result.success) {
        if (result.commits) {
          setCommits(result.commits);
        }
        setHasMoreCommits(!!result.hasMore);
      }
    } catch (error) {
      console.error('Failed to refresh history:', error);
    }
  }, [repoPath, historyLimit]);

  // Trigger refresh when history limit changes (e.g. Load More button)
  useEffect(() => {
    if (repoPath) {
      refreshHistory();
    }
  }, [historyLimit, refreshHistory, repoPath]);

  const refreshStashes = useCallback(async (pathOverride?: string) => {
    const targetPath = pathOverride || repoPath;
    if (!targetPath) return;
    try {
      const result = await (window.electronAPI as any).getStashes();
      if (!pathOverride && targetPath !== repoPathRef.current) return;
      if (result.success) {
        if (result.stashes) {
          setStashes(result.stashes);
        }
      }
    } catch (error) {
      console.error('Failed to refresh stashes:', error);
    }
  }, [repoPath]);

  const refreshRebaseStatus = useCallback(async (pathOverride?: string) => {
    const targetPath = pathOverride || repoPath;
    if (!targetPath) return;
    try {
      const result = await window.electronAPI.gitGetRebaseStatus();
      if (!pathOverride && targetPath !== repoPathRef.current) return;
      if (result.success) {
        setRebaseStatus({ inProgress: result.inProgress, currentStep: result.currentStep, totalSteps: result.totalSteps });

        // If rebase is in progress, check for conflicts
        if (result.inProgress) {
            const conflictResult = await window.electronAPI.getConflictedFiles();
            const conflicts = conflictResult.success && conflictResult.files ? conflictResult.files : [];
            setConflictedFiles(conflicts);

            const currentStep = result.currentStep;
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
            lastConflictCountRef.current = conflicts.length;
        } else {
            // Only reset if we were tracking a rebase to avoid closing dialog during normal merges
            if (lastRebaseStepRef.current !== undefined) {
                setConflictedFiles([]);
                setShowMergeConflictDialog(false); // Close dialog if rebase finished/aborted
                lastRebaseStepRef.current = undefined;
                lastConflictCountRef.current = 0;
            }
        }
      }
    } catch (error) {
       console.error('Failed to check rebase status:', error);
    }
  }, [repoPath]);

  // Auto-refresh every 10 seconds when repository is open
  useAutoRefresh({
    enabled: !!repoPath,
    intervalMs: 10000, // 10 seconds
    refreshFunctions: [refreshStatus, refreshBranch, refreshBranches, refreshHistory, refreshStashes, refreshRebaseStatus, refreshBranchStatus, performFetch],
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
          addLog('success', `Repository cloned successfully to ${path}`);
          toast.success('Repository cloned successfully!');
          
          const testResult = await window.electronAPI.testGitCredentials(url);
          if (testResult.success) {
            setHasCredentials(true);
            addLog('info', 'Git credentials verified - access available');
          } else {
            const credResult = await window.electronAPI.hasCredentials(url);
            if (credResult.success && credResult.hasCredentials) {
              setHasCredentials(true);
            } else {
              setTimeout(() => {
                setShowCredentialsDialog(true);
                addLog('warning', 'Git credentials required for push operations');
              }, 500);
            }
          }

          await refreshAllData(path);
        } else {
          const errorMsg = result.error || 'Failed to clone repository';
          
          // Check for auth error
          if (errorMsg.includes('Authentication failed') || 
              errorMsg.includes('terminal prompts disabled') ||
              errorMsg.includes('could not read Username') ||
              errorMsg.includes('could not read Password') ||
              errorMsg.includes('401') || 
              errorMsg.includes('403')) {
            addLog('warning', 'Clone failed: Authentication required. Please enter credentials.');
            setPendingClone({ url, path });
            setShowCredentialsDialog(true);
          } else {
            addLog('error', errorMsg);
            toast.error(errorMsg);
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Clone failed: ${errorMsg}`);
        toast.error(`Clone failed: ${errorMsg}`);
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
            await refreshStatus();
          } else {
            addLog('error', result.error || 'Failed to unstage file');
          }
        } else {
          const result = await window.electronAPI.gitStage([path]);
          if (result.success) {
            await refreshStatus();
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
          await refreshStatus();
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
          await refreshStatus();
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
          await refreshStatus();
          await refreshStashes();
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
          await refreshStatus();
          await refreshStashes();
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
          await refreshStashes();
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
          await refreshBranchStatus();
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
          addLog('success', `Successfully pulled from origin/${currentBranch}`);
          toast.success('Pulled successfully!');
          await refreshStatus();
          await refreshHistory();
          await refreshBranchStatus();
        } else {
          const errorMsg = result.error || 'Failed to pull';
          addLog('error', errorMsg);
          toast.error(errorMsg);
        }
      } catch (error) {
         const errorMsg = error instanceof Error ? error.message : 'Unknown error';
         addLog('error', `Pull failed: ${errorMsg}`);
         toast.error(`Pull failed: ${errorMsg}`);
      }
    });
  };

  const handleCommit = async (message: string) => {
    const stagedFiles = files.filter((f) => f.staged);
    addLog('info', `Committing ${stagedFiles.length} file(s)...`);
    
    await withLoading('Committing changes...', async () => {
      try {
        const result = await window.electronAPI.gitCommit(message);
        if (result.success) {
          addLog('success', `Committed: "${message}"`);
          toast.success('Changes committed successfully!');
          
          await refreshStatus();
          await refreshHistory();
          await refreshBranchStatus();
          await refreshBranches();
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

    if (!hasCredentials && remoteUrl) {
      setShowCredentialsDialog(true);
      addLog('error', 'Push failed: credentials required');
      toast.error('Please provide credentials first');
      return;
    }

    addLog('info', `Pushing to origin/${currentBranch}...`);
    
    await withLoading(`Pushing to origin/${currentBranch}...`, async () => {
      try {
        const result = await window.electronAPI.gitPush('origin', currentBranch);
        if (result.success) {
          addLog('success', `Successfully pushed to origin/${currentBranch}`);
          toast.success('Changes pushed successfully!');
          await refreshBranchStatus();
        } else {
          const errorMsg = result.error || 'Failed to push';
          
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
          
          if (errorMsg.includes('Authentication') || 
              errorMsg.includes('Permission denied') ||
              errorMsg.includes('401') ||
              errorMsg.includes('403') ||
              errorMsg.includes('could not read Username') ||
              errorMsg.includes('could not read Password')) {
            setHasCredentials(false);
            if (remoteUrl) {
              addLog('warning', 'Invalid credentials detected. Please re-enter your credentials.');
              setShowCredentialsDialog(true);
            }
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Push failed: ${errorMsg}`);
        toast.error(`Push failed: ${errorMsg}`);
        
        if (errorMsg.includes('Authentication') || 
            errorMsg.includes('Permission denied') ||
            errorMsg.includes('401') ||
            errorMsg.includes('403')) {
          setHasCredentials(false);
          if (remoteUrl) {
            setShowCredentialsDialog(true);
          }
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
          addLog('success', `Successfully ${overwrite ? 'force' : 'force-with-lease'} pushed to origin/${currentBranch}`);
          toast.success(`Changes ${overwrite ? 'force' : 'force-with-lease'} pushed successfully!`);
          await refreshBranchStatus();
        } else {
          const errorMsg = result.error || 'Failed to force push';
          addLog('error', errorMsg);
          toast.error(errorMsg);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Force push failed: ${errorMsg}`);
        toast.error(`Force push failed: ${errorMsg}`);
      }
    });
  };

  const handleCredentialsSubmit = async (username: string, password: string) => {
    const targetUrl = pendingClone ? pendingClone.url : remoteUrl;
    
    if (!targetUrl) return;
    
    addLog('info', `Validating credentials for ${username}...`);
    
    await withLoading('Validating credentials...', async () => {
      try {
        const result = await window.electronAPI.saveCredentials(targetUrl, username, password);
        if (result.success) {
          setHasCredentials(true);
          setShowCredentialsDialog(false);
          addLog('success', 'Credentials validated and saved successfully');
          toast.success('Credentials authenticated!');
          
          if (pendingClone) {
            addLog('info', 'Retrying clone with new credentials...');
            const cloneResult = await window.electronAPI.gitClone(pendingClone.url, pendingClone.path, { username, password });
            
            if (cloneResult.success) {
              setRepoPath(pendingClone.path);
              setRepoName(pendingClone.url.split('/').pop()?.replace('.git', '') || 'repository');
              addLog('success', `Repository cloned successfully to ${pendingClone.path}`);
              toast.success('Repository cloned successfully!');
              setPendingClone(null);
              
              await refreshStatus();
              await refreshBranch();
              await refreshHistory();
            } else {
              addLog('error', `Clone failed: ${cloneResult.error}`);
              toast.error(`Clone failed: ${cloneResult.error}`);
              // Keep pending clone? No, maybe user wants to try different creds?
              // Let's keep dialog closed but user can try again.
              setPendingClone(null);
            }
          }
        } else {
          const errorMsg = result.error || 'Failed to validate credentials';
          addLog('error', `Authentication failed: ${errorMsg}`);
          toast.error(`Authentication failed: ${errorMsg}`);
          setHasCredentials(false);
          // If validating for a pending clone failed, we stay in dialog? 
          // Yes, dialog stays open.
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Failed to validate credentials: ${errorMsg}`);
        toast.error(`Failed to validate credentials: ${errorMsg}`);
        setHasCredentials(false);
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
              await refreshRebaseStatus();
              await refreshStatus();
              await refreshHistory();
              await refreshBranch();
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
                await refreshRebaseStatus();
                await refreshStatus();
                await refreshHistory();
                await refreshBranch();
            } else {
               if (result.error && (result.error.includes('conflict') || result.error.includes('resolve'))) {
                   toast.warning('Rebase paused due to conflicts');
                   await refreshRebaseStatus();
                   await refreshStatus(); // To show conflicted files
               } else {
                   toast.error(result.error || 'Failed to continue rebase');
               }
            }
        } catch (error: any) {
            toast.error(`Failed to continue rebase: ${error.message}`);
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
          
          await refreshStatus();
          await refreshBranch();
          await refreshHistory();
          await refreshBranches();
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
          
          await refreshStatus();
          await refreshBranch();
          await refreshHistory();
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
          
          await refreshStatus();
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
          await refreshStatus();
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
    setHasCredentials(false);
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
    setHasCredentials(false);
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
            refreshBranch(),
            refreshStatus(),
            refreshHistory(),
            refreshStashes(),
            refreshBranchStatus(),
            refreshRebaseStatus(),
            refreshBranches()
          ]);
        } else {
          addLog('error', result.error || 'Failed to checkout branch');
          toast.error(result.error || 'Failed to checkout branch');
          // If failed, reload history to restore graph
          await refreshHistory();
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Checkout failed: ${msg}`);
        toast.error(`Checkout failed: ${msg}`);
        await refreshHistory();
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
            refreshBranch(),
            refreshStatus(),
            refreshHistory(),
            refreshStashes(),
            refreshBranchStatus(),
            refreshRebaseStatus(),
            refreshBranches()
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
          await refreshBranches();
        } else {
          addLog('error', result.error || 'Failed to delete branch');
          toast.error(result.error || 'Failed to delete branch');
        }
      } catch (error) {
        addLog('error', `Failed to delete branch: ${error}`);
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
    setHasCredentials(false);
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
              const remoteUrlValue = remoteResult.url;
              
              // 1. Try system credentials (GCM / SSH) first
              const testResult = await window.electronAPI.testGitCredentials(remoteUrlValue);

              if (testResult.success) {
                  setHasCredentials(true);
                  addLog('info', 'Authenticated via system credentials or SSH');
              } else {
                  // 2. If system credentials fail, check for stored PAT credentials
                  const validateResult = await window.electronAPI.validateExistingCredentials(remoteUrlValue);

                  if (validateResult.success) {
                      setHasCredentials(true);
                      addLog('info', 'Authenticated via stored credentials');
                  } else {
                      // 3. Fallback: Check if we have credentials stored even if validation failed (or wasn't performed)
                      const credResult = await window.electronAPI.hasCredentials(remoteUrlValue);
                      if (credResult.success && credResult.hasCredentials) {
                         if (validateResult.error === 'No credentials found') {
                             addLog('warning', 'No credentials found. Please authenticate.');
                             setHasCredentials(false);
                         } else {
                             addLog('warning', `Stored credentials validation failed: ${validateResult.error}`);
                             setHasCredentials(false);
                         }
                      } else {
                         addLog('info', 'No authentication methods available. Push/Pull may fail.');
                         setHasCredentials(false);
                      }
                  }
              }
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4">
      <SplashScreen visible={showSplash} />
      {isLoading && <LoadingOverlay message={loadingMessage} />}
      <div className="w-full space-y-4">
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
                
                {rebaseStatus.inProgress && (            <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="size-2 rounded-full bg-purple-500 animate-pulse" />
                    <span className="font-medium text-purple-200">
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
                        className="px-3 py-1.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-md transition-colors"
                    >
                        Continue
                    </button>
                </div>
            </div>
        )}

        <div className="grid grid-cols-5 gap-4">
          {/* Left Sidebar - Branches & Tags (20%) */}
          {repoName && showLeftPanel && (
            <div className="col-span-1 flex flex-col gap-4">
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
          <div className={`${repoName && showLeftPanel ? 'col-span-4' : 'col-span-5'} flex flex-col gap-4 transition-all duration-300 ${!showBottomPanel ? 'h-[calc(100vh-140px)]' : ''}`}>
            {!repoName ? (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'clone' | 'open')}>
                  <TabsList className="grid w-full grid-cols-2 bg-zinc-900/50 border-b border-zinc-800 rounded-none">
                    <TabsTrigger 
                      value="clone" 
                      className="data-[state=active]:bg-zinc-800/50 data-[state=active]:border-b-2 data-[state=active]:border-emerald-500"
                    >
                      Clone Repository
                    </TabsTrigger>
                    <TabsTrigger 
                      value="open"
                      className="data-[state=active]:bg-zinc-800/50 data-[state=active]:border-b-2 data-[state=active]:border-blue-500"
                    >
                      Open Repository
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="clone" className="p-6 m-0">
                    <CloneRepo onClone={handleClone} />
                  </TabsContent>
                  <TabsContent value="open" className="p-6 m-0">
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
              />
            )}
          </div>
        </div>

        {repoName && showBottomPanel ? (
          <div className="grid grid-cols-2 gap-4">
            <CommitPanel
              files={files}
              onToggleStage={handleToggleStage}
              onCommit={handleCommit}
              onRevertFile={handleRevertFile}
              onDeleteFile={handleDeleteFile}
              onRefresh={() => refreshStatus()}
            />
            <ActivityLog logs={logs} />
          </div>
        ) : !repoName ? (
          <ActivityLog logs={logs} />
        ) : null}
      </div>

      <CredentialsDialog
        open={showCredentialsDialog}
        onClose={() => setShowCredentialsDialog(false)}
        onSubmit={handleCredentialsSubmit}
      />

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

      <Toaster />
    </div>
  );
}