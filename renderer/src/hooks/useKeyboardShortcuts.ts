import { useEffect } from 'react';
import { toast } from 'sonner';

interface UseKeyboardShortcutsProps {
  filesRef: React.MutableRefObject<any[]>;
  selectedFileIndexRef: React.MutableRefObject<number | undefined>;
  commitMessageRef: React.MutableRefObject<string>;
  commitMessageTextareaRef: React.RefObject<HTMLTextAreaElement>;
  setSelectedFileIndex: React.Dispatch<React.SetStateAction<number | undefined>>;
  setCommitMessage: (message: string) => void;
  setShowCreateBranchDialog: (show: boolean) => void;
  setShowShortcutsModal: (show: boolean) => void;
  setShowLeftPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowBottomPanel: React.Dispatch<React.SetStateAction<boolean>>;
  performFetch: () => void;
  handleCommit: (message: string) => Promise<void>;
  refreshStatusInternal: () => Promise<void>;
  refreshHistoryInternal: () => Promise<void>;
  refreshBranchStatusInternal: () => Promise<void>;
  refreshBranchesInternal: () => Promise<void>;
  withLoading: (message: string, fn: () => Promise<void>) => Promise<void>;
  addLog: (type: 'info' | 'success' | 'error' | 'warning', message: string) => void;
}

export function useKeyboardShortcuts({
  filesRef,
  selectedFileIndexRef,
  commitMessageRef,
  commitMessageTextareaRef,
  setSelectedFileIndex,
  setCommitMessage,
  setShowCreateBranchDialog,
  setShowShortcutsModal,
  setShowLeftPanel,
  setShowBottomPanel,
  performFetch,
  handleCommit,
  refreshStatusInternal,
  refreshHistoryInternal,
  refreshBranchStatusInternal,
  refreshBranchesInternal,
  withLoading,
  addLog,
}: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      const shift = e.shiftKey;

      if (cmdOrCtrl) {
        switch (e.key.toLowerCase()) {
          case 'b': // Create branch
            e.preventDefault();
            setShowCreateBranchDialog(true);
            break;
          case 'l': // Fetch all
            e.preventDefault();
            performFetch();
            break;
          case 's': // Stage all (if shift)
            if (shift) {
              e.preventDefault();
              const allPaths = filesRef.current.map(f => f.path);
              if (allPaths.length > 0) {
                await withLoading('Staging all files...', async () => {
                  await window.electronAPI.gitStage(allPaths);
                  await refreshStatusInternal();
                });
              }
            }
            break;
          case 'u': // Unstage all (if shift)
            if (shift) {
              e.preventDefault();
              const allPaths = filesRef.current.map(f => f.path);
              if (allPaths.length > 0) {
                await withLoading('Unstaging all files...', async () => {
                  await window.electronAPI.gitUnstage(allPaths);
                  await refreshStatusInternal();
                });
              }
            }
            break;
          case 'enter': // Commit
            e.preventDefault();
            if (shift) {
              // Stage all and commit
              const allPaths = filesRef.current.map(f => f.path);
              if (allPaths.length > 0) {
                // We do this manually to avoid race conditions with state updates
                await withLoading('Staging and Committing...', async () => {
                  // Stage
                  await window.electronAPI.gitStage(allPaths);
                  // Refresh status (internal, silentish)
                  await refreshStatusInternal();

                  // Commit
                  if (commitMessageRef.current.trim()) {
                      const result = await window.electronAPI.gitCommit(commitMessageRef.current);
                      if (result.success) {
                        addLog('success', `Committed: "${commitMessageRef.current}"`);
                        toast.success('Changes committed successfully!');
                        setCommitMessage('');
                        await Promise.all([
                            refreshStatusInternal(),
                            refreshHistoryInternal(),
                            refreshBranchStatusInternal(),
                            refreshBranchesInternal()
                        ]);
                      } else {
                        addLog('error', result.error || 'Failed to commit');
                        toast.error(result.error || 'Failed to commit');
                      }
                  } else {
                      toast.warning('Please enter a commit message');
                      commitMessageTextareaRef.current?.focus();
                  }
                });
              }
            } else {
              // Commit staged
              handleCommit(commitMessageRef.current);
            }
            break;
          case 'm': // Focus commit message
             if (shift) {
                 e.preventDefault();
                 commitMessageTextareaRef.current?.focus();
             }
             break;
           case '/': // Open shortcuts
             e.preventDefault();
             setShowShortcutsModal(true);
             break;

            // Existing Layout Shortcuts (preserved)
           case 'arrowup':
            if (!shift && !e.altKey) {
                e.preventDefault();
                setShowLeftPanel(false);
                setShowBottomPanel(false);
                toast.info('Maximized Git Graph');
            }
            break;
           case 'arrowleft':
            if (!shift && !e.altKey) {
                e.preventDefault();
                setShowLeftPanel(prev => {
                  const newState = !prev;
                  toast.info(newState ? 'Shown Left Panel' : 'Hidden Left Panel');
                  return newState;
                });
            }
            break;
           case 'arrowdown':
            if (!shift && !e.altKey) {
                e.preventDefault();
                setShowBottomPanel(prev => {
                  const newState = !prev;
                  toast.info(newState ? 'Shown Bottom Panel' : 'Hidden Bottom Panel');
                  return newState;
                });
            }
            break;
        }
      } else {
        // No modifier (except shift maybe)
        const target = e.target as HTMLElement;
        const isInput = ['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable;

        if (!isInput) {
            switch (e.key) {
                case 's':
                case 'S':
                    // Stage current file
                    if (selectedFileIndexRef.current !== undefined && filesRef.current[selectedFileIndexRef.current]) {
                        const file = filesRef.current[selectedFileIndexRef.current];
                        if (!file.staged) {
                            withLoading('Staging file...', async () => {
                                await window.electronAPI.gitStage([file.path]);
                                await refreshStatusInternal();
                            });
                        }
                    }
                    break;
                case 'u':
                case 'U':
                     // Unstage current file
                    if (selectedFileIndexRef.current !== undefined && filesRef.current[selectedFileIndexRef.current]) {
                        const file = filesRef.current[selectedFileIndexRef.current];
                        if (file.staged) {
                            withLoading('Unstaging file...', async () => {
                                await window.electronAPI.gitUnstage([file.path]);
                                await refreshStatusInternal();
                            });
                        }
                    }
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setSelectedFileIndex(prev => {
                        if (filesRef.current.length === 0) return undefined;
                        if (prev === undefined) return filesRef.current.length - 1;
                        return Math.max(0, prev - 1);
                    });
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    setSelectedFileIndex(prev => {
                         if (filesRef.current.length === 0) return undefined;
                         if (prev === undefined) return 0;
                         return Math.min(filesRef.current.length - 1, prev + 1);
                    });
                    break;
            }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    filesRef,
    selectedFileIndexRef,
    commitMessageRef,
    commitMessageTextareaRef,
    setSelectedFileIndex,
    setCommitMessage,
    setShowCreateBranchDialog,
    setShowShortcutsModal,
    setShowLeftPanel,
    setShowBottomPanel,
    performFetch,
    handleCommit,
    refreshStatusInternal,
    refreshHistoryInternal,
    refreshBranchStatusInternal,
    refreshBranchesInternal,
    withLoading,
    addLog,
  ]);
}
