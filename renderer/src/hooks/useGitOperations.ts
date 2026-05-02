import { useCallback } from 'react';
import { useGitState, FileChange } from './useGitState';
import { useUIState } from './useUIState';

export interface UseGitOperationsProps {
  gitState: ReturnType<typeof useGitState>;
  uiState: ReturnType<typeof useUIState> & { withLoading: (msg: string, fn: () => Promise<void>) => Promise<void> };
  refs: {
    filesRef: React.MutableRefObject<FileChange[]>;
    setCommitMessage: (msg: string) => void;
  };
}

export function useGitOperations({
  gitState,
  uiState,
  refs
}: UseGitOperationsProps) {
  const {
    repoPath, setRepoPath,
    setRepoName,
    currentBranch, setCurrentBranch,
    files, setFiles,
    setCommits,
    setStashes,
    remoteUrl, setRemoteUrl,
    setConflictedFiles,
    setRebaseStatus,
    setBranchStatus,
    refreshAllData,
    refreshStatusInternal,
    refreshBranchInternal,
    refreshBranchesInternal,
    refreshBranchStatusInternal,
    refreshHistoryInternal,
    refreshStashesInternal,
    refreshRebaseStatusInternal,
    refreshSubmodulesInternal
  } = gitState;

  const {
    setHistoryLimit,
    setShowAddRemoteDialog,
    setShowForcePushDialog,
    setShowResetDialog,
    setResetTargetCommit,
    resetTargetCommit,
    setShowMergeConflictDialog,
    setShowSettingsDialog,
    setActiveTab,
    withLoading,
    addLog,
    checkAuthError,
    toast,
    setHasCredentials
  } = uiState;

  const { filesRef, setCommitMessage } = refs;

  const handleCommit = useCallback(async (message: string, amend: boolean = false) => {
    const currentFiles = filesRef.current;
    const stagedFiles = currentFiles.filter((f: FileChange) => f.staged);
    addLog('info', amend ? `Amending commit...` : `Committing ${stagedFiles.length} file(s)...`);

    await withLoading(amend ? 'Amending commit...' : 'Committing changes...', async () => {
      try {
        const result = await window.electronAPI.gitCommit(message, amend);
        if (result.success) {
          addLog('success', amend ? `Amended commit: "${message}"` : `Committed: "${message}"`);
          toast.success('Changes committed successfully!');
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
  }, [withLoading, refreshStatusInternal, refreshHistoryInternal, refreshBranchStatusInternal, refreshBranchesInternal, addLog, filesRef, setCommitMessage, toast]);

  const handleGenerateCommitMessage = useCallback(async () => {
    addLog('info', 'Generating commit message using AI...');
    await withLoading('Generating commit message...', async () => {
      try {
        const result = await window.electronAPI.gitGenerateCommitMessage();
        if (result.success && result.message) {
          setCommitMessage(result.message);
          addLog('success', 'Commit message generated successfully');
          toast.success('Commit message generated!');
        } else {
          const errorMsg = result.error || 'Failed to generate commit message';
          addLog('error', errorMsg);
          toast.error(errorMsg);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Generation failed: ${errorMsg}`);
        toast.error(`Generation failed: ${errorMsg}`);
      }
    });
  }, [withLoading, addLog, setCommitMessage, toast]);

  const handleUndoCommit = async () => {
    await withLoading('Undoing last commit...', async () => {
      try {
        const result = await window.electronAPI.gitUndoCommit();
        if (result.success) {
          toast.success('Last commit undone successfully');
          addLog('success', 'Undid last commit');
          await refreshStatusInternal();
          await refreshHistoryInternal();
          await refreshBranchStatusInternal();
          await refreshBranchesInternal();
        } else {
          toast.error(result.error || 'Failed to undo commit');
          addLog('error', `Failed to undo commit: ${result.error}`);
        }
} catch (error) {
        toast.error(`Failed to undo commit: ${error.message}`);
        addLog('error', `Failed to undo commit: ${error.message}`);
      }
    });
  };

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
          if (!checkAuthError(errorMsg, false, result.errorType)) {
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
    const file = files.find((f: FileChange) => f.path === path);
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
        const result = await window.electronAPI.revertFileChanges(path);
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
        const result = await window.electronAPI.deleteFile(path);
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
        const result = await window.electronAPI.createStash();
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
        const result = await window.electronAPI.applyStash(name);
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
        const result = await window.electronAPI.deleteStash(name);
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
          if (!checkAuthError(errorMsg, false, result.errorType)) {
            if (result.errorType === 'MergeConflictError') {
              setShowMergeConflictDialog(true);
              toast.error('Pull resulted in merge conflicts. Please resolve them.');
            } else if (result.errorType === 'DetachedHeadError') {
              toast.error('Cannot pull in a detached HEAD state. Please create or checkout a branch.');
            } else {
              toast.error(errorMsg);
            }
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
    if (!remoteUrl) {
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
          if (checkAuthError(errorMsg, false, result.errorType)) {
            addLog('error', errorMsg);
            return;
          }
          if (result.errorType === 'DetachedHeadError') {
            toast.error('Cannot push in a detached HEAD state. Please create a branch.');
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
          if (!checkAuthError(errorMsg, false, result.errorType)) {
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
} catch (error) {
        toast.error(`Failed to abort rebase: ${error.message}`);
      }
    });
  };

  const handleContinueRebase = async () => {
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
            await refreshStatusInternal();
          } else {
            toast.error(result.error || 'Failed to continue rebase');
          }
        }
} catch (error) {
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
            await refreshRebaseStatusInternal();
            await refreshStatusInternal();
          } else {
            toast.error(errorMsg);
            addLog('error', errorMsg);
          }
        }
} catch (error) {
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
} catch (error) {
        toast.error(`Failed to abort cherry-pick: ${error.message}`);
      }
    });
  };

  const handleContinueCherryPick = async () => {
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
} catch (error) {
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
} catch (error) {
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
          addLog('error', `Merge failed: ${result.error || 'Unknown error'}`);
          if (result.errorType === 'MergeConflictError') {
            setShowMergeConflictDialog(true);
            toast.error('Merge conflicts detected. Please resolve them.');
          } else if (result.errorType === 'DetachedHeadError') {
            toast.error('Cannot merge in a detached HEAD state. Please create or checkout a branch.');
          } else {
            toast.error(result.error || 'Merge failed');
          }
        }
} catch (error) {
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
} catch (error) {
        const errorMessage = error.message || 'Unknown error';
        toast.error(`Failed to open file: ${errorMessage}`);
        addLog('error', `Failed to open ${filePath}: ${errorMessage}`);
      }
    });
  };

  const handleAbortConflict = async () => {
    await withLoading('Aborting operation...', async () => {
      try {
        const result = await window.electronAPI.abortConflict();
        if (result.success) {
          toast.success('Operation aborted successfully');
          addLog('info', 'Operation aborted');
          setShowMergeConflictDialog(false);
          setConflictedFiles([]);

          await refreshStatusInternal();
          await refreshBranchInternal();
          await refreshHistoryInternal();
        } else {
          toast.error(result.error || 'Failed to abort operation');
          addLog('error', `Failed to abort operation: ${result.error || 'Unknown error'}`);
        }
} catch (error) {
        const errorMessage = error.message || 'Unknown error';
        toast.error(`Failed to abort operation: ${errorMessage}`);
        addLog('error', `Failed to abort operation: ${errorMessage}`);
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
} catch (error) {
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
} catch (error) {
        const errorMessage = error.message || 'Unknown error';
        toast.error(`Failed to resolve conflict: ${errorMessage}`);
        addLog('error', `Failed to resolve conflict: ${errorMessage}`);
      }
    });
  };

  const handleOpenRepo = async (path: string) => {
    addLog('info', `Opening repository from ${path}...`);

    setFiles([]);
    setCommits([]);

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
    setCommits([]);
    await withLoading(`Switching to branch ${branch}...`, async () => {
      try {
        const result = await window.electronAPI.gitCheckoutBranch(branch);
        if (result.success) {
          addLog('success', `Switched to branch ${branch}`);
          setCurrentBranch(branch);
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

  const handleDeleteRemoteBranch = async (branch: string) => {
    await withLoading(`Deleting remote branch ${branch}...`, async () => {
      try {
        const result = await window.electronAPI.deleteRemoteBranch(branch);
        if (result.success) {
          addLog('success', `Deleted remote branch ${branch}`);
          toast.success(`Deleted remote branch ${branch}`);
          await refreshBranchesInternal();
        } else {
          addLog('error', result.error || 'Failed to delete remote branch');
          toast.error(result.error || 'Failed to delete remote branch');
        }
      } catch (error) {
        addLog('error', `Failed to delete remote branch: ${error}`);
      }
    });
  };

  const handleBranchDropAction = useCallback(async (source: string, target: string, action: 'merge' | 'rebase') => {
    if (action === 'merge') {
      if (currentBranch !== target) {
        await handleCheckout(target);
      }
      await handleMergeBranch(source);
    } else {
      if (currentBranch !== source) {
        await handleCheckout(source);
      }
      
      addLog('info', `Rebasing ${source} onto ${target}...`);
      await withLoading(`Rebasing ${source} onto ${target}...`, async () => {
        try {
          const result = await window.electronAPI.gitRebaseBranch(target);
          if (result.success) {
            toast.success(`Successfully rebased ${source} onto ${target}`);
            addLog('success', `Rebased ${source} onto ${target}`);
            await Promise.all([
              refreshStatusInternal(),
              refreshHistoryInternal(),
              refreshBranchStatusInternal(),
              refreshBranchesInternal(),
              refreshBranchInternal()
            ]);
          } else {
            if (result.error && result.error.includes('conflict')) {
              toast.warning('Rebase started but encountered conflicts. Please resolve them.');
              addLog('warning', 'Rebase encountered conflicts. Please resolve them.');
              await refreshRebaseStatusInternal();
              await refreshStatusInternal();
            } else {
              toast.error(`Rebase failed: ${result.error}`);
              addLog('error', `Rebase failed: ${result.error}`);
            }
          }
        } catch (err: any) {
          toast.error(`Rebase failed: ${err.message}`);
          addLog('error', `Rebase failed: ${err.message}`);
        }
      });
    }
  }, [currentBranch, handleCheckout, handleMergeBranch, withLoading, addLog, toast, refreshRebaseStatusInternal, refreshStatusInternal, refreshHistoryInternal, refreshBranchStatusInternal, refreshBranchesInternal, refreshBranchInternal]);

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
} catch (error) {
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
} catch (error) {
        const msg = error.message || 'Unknown error';
        toast.error(`Reset failed: ${msg}`);
        addLog('error', `Reset failed: ${msg}`);
      }
    });
  };

  const handleCancelOperation = async () => {
    try {
      const result = await window.electronAPI.gitCancelOperation();
      if (result.success) {
        toast.info('Operation cancellation requested');
        addLog('info', 'Operation cancellation requested by user');
      }
    } catch (error) {
      console.error('Failed to cancel operation:', error);
    }
  };

  const checkGitFlowInitialized = async () => {
    try {
      const result = await window.electronAPI.checkGitFlowInitialized();
      if (result.success) {
        return result.initialized;
      }
      return false;
    } catch (error) {
      console.error('Failed to check git flow initialization:', error);
      return false;
    }
  };

  const handleInitGitFlow = async () => {
    await withLoading('Initializing Git Flow...', async () => {
      try {
        const result = await window.electronAPI.initializeGitFlow();
        if (result.success) {
          toast.success('Git Flow initialized successfully!');
          addLog('success', 'Initialized Git Flow');
          await refreshAllData(repoPath);
        } else {
          toast.error(`Failed to initialize Git Flow: ${result.error}`);
          addLog('error', `Git Flow init failed: ${result.error}`);
        }
} catch (error) {
        toast.error(`Git Flow error: ${error.message || 'Unknown error'}`);
      }
    });
  };

  const handleStartGitFlow = async (type: 'feature' | 'bugfix' | 'release' | 'hotfix' | 'support', name: string) => {
    await withLoading(`Starting ${type} ${name}...`, async () => {
      try {
        const result = await window.electronAPI.startGitFlowBranch(type, name);
        if (result.success) {
          toast.success(`Started ${type}: ${name}`);
          addLog('success', `Started git flow ${type}: ${name}`);
          await refreshAllData(repoPath);
        } else {
          toast.error(`Failed to start ${type}: ${result.error}`);
          addLog('error', `Git Flow start failed: ${result.error}`);
        }
} catch (error) {
        toast.error(`Git Flow error: ${error.message || 'Unknown error'}`);
      }
    });
  };

  const handleFinishGitFlow = async (type: 'feature' | 'bugfix' | 'release' | 'hotfix' | 'support', name: string) => {
    await withLoading(`Finishing ${type} ${name}...`, async () => {
      try {
        const result = await window.electronAPI.finishGitFlowBranch(type, name);
        if (result.success) {
          toast.success(`Finished ${type}: ${name}`);
          addLog('success', `Finished git flow ${type}: ${name}`);
          await refreshAllData(repoPath);
        } else {
          toast.error(`Failed to finish ${type}: ${result.error}`);
          addLog('error', `Git Flow finish failed: ${result.error}`);
        }
} catch (error) {
        toast.error(`Git Flow error: ${error.message || 'Unknown error'}`);
      }
    });
  };

  const handleSyncSubmodules = async () => {
    await withLoading('Synchronizing submodules...', async () => {
      try {
        const result = await window.electronAPI.updateSubmodules();
        if (result.success) {
          toast.success('Submodules synchronized successfully!');
          addLog('success', 'Submodules synchronized');
          await refreshSubmodulesInternal();
        } else {
          toast.error(result.error || 'Failed to sync submodules');
          addLog('error', `Failed to sync submodules: ${result.error}`);
        }
} catch (error) {
        toast.error(`Failed to sync submodules: ${error.message}`);
      }
    });
  };

  const handleAddSubmodule = async (url: string, path: string, applyConfigs: boolean) => {
    await withLoading('Adding submodule...', async () => {
      try {
        const result = await window.electronAPI.addSubmodule(url, path, applyConfigs);
        if (result.success) {
          toast.success(`Submodule added at ${path}`);
          addLog('success', `Added submodule from ${url} to ${path}`);
          await refreshSubmodulesInternal();
          await refreshStatusInternal();
        } else {
          toast.error(result.error || 'Failed to add submodule');
          addLog('error', `Failed to add submodule: ${result.error}`);
        }
} catch (error) {
        toast.error(`Failed to add submodule: ${error.message}`);
      }
    });
  };

  const handleRemoveSubmodule = async (path: string) => {
    await withLoading('Removing submodule...', async () => {
      try {
        const result = await window.electronAPI.removeSubmodule(path);
        if (result.success) {
          toast.success(`Submodule removed: ${path}`);
          addLog('success', `Removed submodule at ${path}`);
          await refreshSubmodulesInternal();
          await refreshStatusInternal();
        } else {
          toast.error(result.error || 'Failed to remove submodule');
          addLog('error', `Failed to remove submodule: ${result.error}`);
        }
} catch (error) {
        toast.error(`Failed to remove submodule: ${error.message}`);
      }
    });
  };

  const handleGenerateConflictResolution = useCallback(async (filePath: string) => {
    try {
      addLog('info', `AI is analyzing conflict in ${filePath}...`);
      const result = await window.electronAPI.gitGenerateConflictResolution(filePath);
      if (result.success && result.explanation !== undefined && result.resolvedCode !== undefined) {
        addLog('success', `AI proposed a resolution for ${filePath}`);
        return { explanation: result.explanation, resolvedCode: result.resolvedCode };
      } else {
        const errorMsg = result.error || 'AI failed to generate conflict resolution';
        toast.error(errorMsg);
        addLog('error', `AI conflict resolution failed: ${errorMsg}`);
        return null;
      }
    } catch (error: any) {
      const msg = error.message || 'Unknown error';
      toast.error(`AI Error: ${msg}`);
      addLog('error', `AI Error: ${msg}`);
      return null;
    }
  }, [addLog]);

  const handleApplyConflictResolution = useCallback(async (filePath: string, resolvedCode: string) => {
    await withLoading('Applying AI resolution...', async () => {
      try {
        const result = await window.electronAPI.gitApplyConflictResolution(filePath, resolvedCode);
        if (result.success) {
          toast.success(`Applied AI resolution to ${filePath}`);
          addLog('success', `Applied AI resolution to ${filePath}`);
          await refreshStatusInternal();
        } else {
          toast.error(result.error || 'Failed to apply resolution');
          addLog('error', `Failed to apply resolution: ${result.error}`);
        }
      } catch (error: any) {
        const msg = error.message || 'Unknown error';
        toast.error(`Error applying resolution: ${msg}`);
        addLog('error', `Error applying resolution: ${msg}`);
      }
    });
  }, [addLog, refreshStatusInternal, withLoading]);

  return {
    handleCommit,
    handleGenerateCommitMessage,
    handleClone,
    handleStageAll,
    handleUnstageAll,
    handleToggleStage,
    handleRevertFile,
    handleDeleteFile,
    handleStash,
    handleApplyStash,
    handleDeleteStash,
    handleAddRemote,
    handlePull,
    handlePush,
    handleForcePush,
    handleAbortRebase,
    handleContinueRebase,
    handleCherryPick,
    handleAbortCherryPick,
    handleContinueCherryPick,
    handleSkipCherryPick,
    handleMergeBranch,
    handleOpenFileInMergeTool,
    handleAbortConflict,
    handleResolveFiles,
    handleResolveConflict,
    handleSwitchRepo,
    handleOpenNewRepo,
    handleCheckout,
    handleCreateBranch,
    handleDeleteBranch,
    handleDeleteRemoteBranch,
    handleBranchDropAction,
    handleRevertCommit,
    handleResetCommits,
    handleConfirmReset,
    handleOpenRepo,
    handleUndoCommit,
    handleCancelOperation,
    checkGitFlowInitialized,
    handleInitGitFlow,
    handleStartGitFlow,
    handleFinishGitFlow,
    handleSyncSubmodules,
    handleAddSubmodule,
    handleRemoveSubmodule,
    handleGenerateConflictResolution,
    handleApplyConflictResolution
  };
}
