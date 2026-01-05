import { useState, useEffect, useCallback, useRef } from 'react';
import { CloneRepo } from './components/CloneRepo';
import { OpenRepo } from './components/OpenRepo';
import { CommitPanel } from './components/CommitPanel';
import { ActivityLog } from './components/ActivityLog';
import { RepoHeader } from './components/RepoHeader';
import { CredentialsDialog } from './components/CredentialsDialog';
import { MergeConflictDialog } from './components/MergeConflictDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { CommitGraph } from './components/CommitGraph';
import { BranchesPanel } from './components/BranchesPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import { LoadingOverlay } from './components/ui/spinner';

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
      gitPushTags: (remote?: string) => Promise<{ success: boolean; error?: string }>;
      gitPull: (remote?: string, branch?: string) => Promise<{ success: boolean; error?: string }>;
      gitGetCurrentBranch: () => Promise<{ success: boolean; branch?: string; error?: string }>;
      gitGetHistory: (maxCount?: number) => Promise<{ success: boolean; commits?: Commit[]; error?: string }>;
      gitGetBranches: () => Promise<{ success: boolean; branches?: string[]; error?: string }>;
      gitCreateBranch: (name: string, checkout?: boolean) => Promise<{ success: boolean; error?: string }>;
      createTag: (tagName: string, commitHash: string, message?: string) => Promise<{ success: boolean; error?: string }>;
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
      deleteTag: (tagName: string) => Promise<{ success: boolean; error?: string }>;
      getTagsForCommit: (commitHash: string) => Promise<{ success: boolean; tags?: string[]; error?: string }>;
      testGitCredentials: (remoteUrl: string) => Promise<{ success: boolean; error?: string }>;
      showOpenDialog: (options?: { properties?: string[]; title?: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
      getRecentRepos: () => Promise<{ success: boolean; repos?: Array<{ path: string; name: string; lastOpened: number }>; error?: string }>;
      addRecentRepo: (path: string) => Promise<{ success: boolean; error?: string }>;
      getMergeToolPath: () => Promise<{ success: boolean; mergeToolPath?: string; error?: string }>;
      setMergeToolPath: (path: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

export default function App() {
  const [repoName, setRepoName] = useState<string | null>(null);
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [currentBranch, setCurrentBranch] = useState('main');
  const [hasCredentials, setHasCredentials] = useState(false);
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [files, setFiles] = useState<FileChange[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'clone' | 'open'>('clone');
  const [unpushedCommitsCount, setUnpushedCommitsCount] = useState(0);
  const [showMergeConflictDialog, setShowMergeConflictDialog] = useState(false);
  const [conflictedFiles, setConflictedFiles] = useState<string[]>([]);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [rebaseStatus, setRebaseStatus] = useState<{ inProgress: boolean; currentStep?: number; totalSteps?: number }>({ inProgress: false });
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | undefined>(undefined);
  const lastRebaseStepRef = useRef<number | undefined>(undefined);
  const lastConflictCountRef = useRef<number>(0);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    loadRepository();
  }, []);

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

  const loadRepository = async () => {
    try {
      const result = await window.electronAPI.getRepoPath();
      if (result.success && result.path) {
        setRepoPath(result.path);
        const nameResult = await window.electronAPI.getRepoName();
        if (nameResult.success && nameResult.name) {
          setRepoName(nameResult.name);
        }
      }
    } catch (error) {
      console.error('Failed to load repository:', error);
    }
  };

  const refreshStatus = useCallback(async () => {
    if (!repoPath) return;
    try {
      const result = await window.electronAPI.gitStatus();
      if (result.success && result.files) {
        setFiles(result.files);
      }
    } catch (error) {
      console.error('Failed to refresh status:', error);
    }
  }, [repoPath]);

  const refreshBranch = useCallback(async () => {
    if (!repoPath) return;
    try {
      const result = await window.electronAPI.gitGetCurrentBranch();
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

  const refreshHistory = useCallback(async () => {
    if (!repoPath) return;
    try {
      const result = await window.electronAPI.gitGetHistory(50);
      if (result.success) {
        if (result.commits) {
          setCommits(result.commits);
        }
      }
    } catch (error) {
      console.error('Failed to refresh history:', error);
    }
  }, [repoPath]);

  const refreshUnpushedCommits = useCallback(async () => {
    if (!repoPath) return;
    try {
      const result = await (window.electronAPI as any).hasUnpushedCommits();
      if (result.success) {
        setUnpushedCommitsCount(result.count || 0);
      }
    } catch (error) {
      console.error('Failed to check unpushed commits:', error);
    }
  }, [repoPath]);

  const refreshRebaseStatus = useCallback(async () => {
    if (!repoPath) return;
    try {
      const result = await window.electronAPI.gitGetRebaseStatus();
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
            setConflictedFiles([]);
            lastRebaseStepRef.current = undefined;
            lastConflictCountRef.current = 0;
        }
      }
    } catch (error) {
       console.error('Failed to check rebase status:', error);
    }
  }, [repoPath]);

  useEffect(() => {
    if (repoPath) {
      refreshStatus();
      refreshBranch();
      refreshHistory();
      refreshUnpushedCommits();
      refreshRebaseStatus();
    }
  }, [repoPath, refreshStatus, refreshBranch, refreshHistory, refreshUnpushedCommits, refreshRebaseStatus]);

  // Auto-refresh every 10 seconds when repository is open
  useAutoRefresh({
    enabled: !!repoPath,
    intervalMs: 10000, // 10 seconds
    refreshFunctions: [refreshStatus, refreshBranch, refreshHistory, refreshUnpushedCommits, refreshRebaseStatus],
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

          await refreshStatus();
          await refreshBranch();
          await refreshHistory();
        } else {
          addLog('error', result.error || 'Failed to clone repository');
          toast.error(result.error || 'Failed to clone repository');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Clone failed: ${errorMsg}`);
        toast.error(`Clone failed: ${errorMsg}`);
      }
    });
  };

  const handlePushTags = async () => {
    if (!hasCredentials && remoteUrl) {
      setShowCredentialsDialog(true);
      addLog('error', 'Push failed: credentials required');
      toast.error('Please provide credentials first');
      return;
    }

    addLog('info', `Pushing tags...`);

    await withLoading(`Pushing tags...`, async () => {
      try {
        const result = await (window.electronAPI as any).pushTags('origin');
        if (result.success) {
          addLog('success', `Successfully pushed tags`);
          toast.success('Tags pushed successfully!');
        } else {
          const errorMsg = result.error || 'Failed to push tags';
          addLog('error', errorMsg);
          toast.error(errorMsg);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Push failed: ${errorMsg}`);
        toast.error(`Push failed: ${errorMsg}`);
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
          await refreshUnpushedCommits();
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
          await refreshUnpushedCommits();
        } else {
          const errorMsg = result.error || 'Failed to push';
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

  const handleCredentialsSubmit = async (username: string, password: string) => {
    if (!remoteUrl) return;
    
    addLog('info', `Validating credentials for ${username}...`);
    
    await withLoading('Validating credentials...', async () => {
      try {
        const result = await window.electronAPI.saveCredentials(remoteUrl, username, password);
        if (result.success) {
          setHasCredentials(true);
          setShowCredentialsDialog(false);
          addLog('success', 'Credentials validated and saved successfully');
          toast.success('Credentials authenticated!');
        } else {
          const errorMsg = result.error || 'Failed to validate credentials';
          addLog('error', `Authentication failed: ${errorMsg}`);
          toast.error(`Authentication failed: ${errorMsg}`);
          setHasCredentials(false);
          const credCheck = await window.electronAPI.hasCredentials(remoteUrl);
          if (credCheck.success && credCheck.hasCredentials) {
            addLog('warning', 'Failed credentials were removed from storage');
          }
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
    setHasCredentials(false);
    setRemoteUrl(null);
    setActiveTab('clone');
    addLog('info', 'Ready to open a new repository');
  };

  const handleCheckout = async (branch: string) => {
    await withLoading(`Switching to branch ${branch}...`, async () => {
      setCurrentBranch(branch);
      await refreshBranch(); 
      await refreshStatus();
      await refreshHistory();
    });
  };

  const handleCreateBranch = async (name: string) => {
    await withLoading(`Creating branch ${name}...`, async () => {
      setCurrentBranch(name);
      await refreshBranch();
      await refreshStatus();
      addLog('success', `Created and checked out branch: ${name}`);
    });
  };

  const handleDeleteBranch = async (branch: string) => {
    await withLoading(`Deleting branch ${branch}...`, async () => {
      await refreshBranch();
    });
  };

  const handleDeleteTag = async (tag: string) => {
    // Tags are refreshed when the tags tab is opened, no explicit refresh needed here generally,
    // but we could trigger a refresh.
  };

  const handleOpenRepo = async (path: string) => {
    addLog('info', `Opening repository from ${path}...`);
    
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
              
              addLog('info', 'Testing Git credential system...');
              const gitCredTest = await window.electronAPI.testGitCredentials(remoteUrlValue);
              
              if (gitCredTest.success) {
                setHasCredentials(true);
                addLog('success', 'Git credential system authenticated successfully');
              } else {
                const credResult = await window.electronAPI.hasCredentials(remoteUrlValue);
                if (credResult.success && credResult.hasCredentials) {
                  addLog('info', 'Validating saved credentials...');
                  const validationResult = await window.electronAPI.validateExistingCredentials(remoteUrlValue);
                  
                  if (validationResult.success) {
                    setHasCredentials(true);
                    addLog('success', 'Saved credentials validated successfully');
                  } else {
                    addLog('warning', 'Saved credentials are invalid, removing from storage...');
                    await window.electronAPI.deleteCredentials(remoteUrlValue);
                    setHasCredentials(false);
                    
                    setTimeout(() => {
                      setShowCredentialsDialog(true);
                      addLog('warning', 'Please enter new credentials');
                    }, 500);
                  }
                } else {
                  setHasCredentials(false);
                  addLog('info', 'No credentials configured. You may be prompted when performing push/pull operations.');
                }
              }
            }
          } catch (error) {
            console.log('No remote configured for this repository');
          }
          
          await refreshStatus();
          await refreshBranch();
          await refreshHistory();
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
      {isLoading && <LoadingOverlay message={loadingMessage} />}
      <div className="w-full space-y-4">
        <RepoHeader
          repoName={repoName}
          currentBranch={currentBranch}
          hasCredentials={hasCredentials}
          onSwitchRepo={handleSwitchRepo}
          onOpenNew={handleOpenNewRepo}
          onOpenSettings={() => setShowSettingsDialog(true)}
          onPushTags={handlePushTags}
        />

        {rebaseStatus.inProgress && (
            <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg p-3 flex items-center justify-between">
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
          {repoName && (
            <div className="col-span-1 flex flex-col gap-4">
              <BranchesPanel
                currentBranch={currentBranch}
                onCheckout={handleCheckout}
                onCreateBranch={handleCreateBranch}
                onDeleteBranch={handleDeleteBranch}
                onDeleteTag={handleDeleteTag}
                onMergeBranch={handleMergeBranch}
                onSetLoading={(loading, message) => {
                  setIsLoading(loading);
                  setLoadingMessage(message);
                }}
              />
            </div>
          )}

          {/* Main Content Area - Graph or Repo Selector */}
          <div className={`${repoName ? 'col-span-4' : 'col-span-5'} flex flex-col gap-4`}>
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
                refreshHistory={refreshHistory}
              />
            )}
          </div>
        </div>

        {repoName ? (
          <div className="grid grid-cols-2 gap-4">
            <CommitPanel
              files={files}
              onToggleStage={handleToggleStage}
              onCommit={handleCommit}
              onPush={handlePush}
              hasCredentials={hasCredentials}
              unpushedCommitsCount={unpushedCommitsCount}
              onRevertFile={handleRevertFile}
              onDeleteFile={handleDeleteFile}
            />
            <ActivityLog logs={logs} />
          </div>
        ) : (
          <ActivityLog logs={logs} />
        )}
      </div>

      <CredentialsDialog
        open={showCredentialsDialog}
        onSubmit={handleCredentialsSubmit}
      />

      <MergeConflictDialog
        open={showMergeConflictDialog}
        conflictedFiles={conflictedFiles}
        onOpenFile={handleOpenFileInMergeTool}
        onAbortMerge={handleAbortMerge}
        onResolveFiles={handleResolveFiles}
        onClose={() => setShowMergeConflictDialog(false)}
      />

      <SettingsDialog
        open={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
      />

      <Toaster />
    </div>
  );
}