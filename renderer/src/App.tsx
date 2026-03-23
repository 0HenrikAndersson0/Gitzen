import { useState, useEffect, useRef } from 'react';
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
import { GraphsView } from './components/GraphsView';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { LoadingOverlay } from './components/ui/spinner';
import { SplashScreen } from './components/SplashScreen';
import { ForcePushDialog } from './components/ForcePushDialog';
import { ShortcutsModal } from './components/ShortcutsModal';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './components/ui/dialog';
import { GripVertical } from 'lucide-react';

import { useGitState } from './hooks/useGitState';
import { useGitOperations } from './hooks/useGitOperations';
import { useUIState } from './hooks/useUIState';

export default function App() {
  const uiState = useUIState();
  const {
    activeTab, setActiveTab,
    showAddRemoteDialog, setShowAddRemoteDialog,
    showForcePushDialog, setShowForcePushDialog,
    showResetDialog, setShowResetDialog,
    resetTargetCommit,
    showMergeConflictDialog, setShowMergeConflictDialog,
    showSettingsDialog, setShowSettingsDialog,
    showCreateBranchDialog, setShowCreateBranchDialog,
    showShortcutsModal, setShowShortcutsModal,
    showSplash, setShowSplash,
    isLoading, setIsLoading,
    loadingMessage, setLoadingMessage,
    showLeftPanel, setShowLeftPanel,
    showBottomPanel, setShowBottomPanel,
    showGraphs, setShowGraphs,
    logs,
    hasCredentials, setHasCredentials,
    historyLimit, setHistoryLimit,
    addLog,
    checkAuthError,
    applyTheme,
  } = uiState;

  const gitState = useGitState({
    historyLimit,
    checkAuthError,
    setHasCredentials,
    setShowMergeConflictDialog
  });

  const {
    repoName, setRepoName,
    repoPath, setRepoPath,
    currentBranch,
    branchStatus,
    files,
    commits,
    hasMoreCommits,
    stashes,
    localBranches,
    remoteBranches,
    isRefreshingBranches,
    remoteUrl, setRemoteUrl,
    conflictedFiles,
    rebaseStatus,
    cherryPickStatus,
    runQueued,
    refreshAllData,
    refreshStatusInternal,
    refreshStatus,
    refreshHistoryInternal,
    refreshHistory,
    refreshBranchStatusInternal,
    refreshBranchesInternal
  } = gitState;

  // Keyboard Shortcuts State
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | undefined>(undefined);

  // Resize State
  const [leftPanelWidth, setLeftPanelWidth] = useState(250); // px
  const [rightPanelWidth, setRightPanelWidth] = useState(350); // px
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing === 'left') {
        let newWidth = e.clientX;
        if (newWidth < 150) newWidth = 150;
        if (newWidth > window.innerWidth / 2) newWidth = window.innerWidth / 2;
        setLeftPanelWidth(newWidth);
      } else if (isResizing === 'right') {
        let newWidth = window.innerWidth - e.clientX;
        if (newWidth < 200) newWidth = 200;
        if (newWidth > window.innerWidth / 2) newWidth = window.innerWidth / 2;
        setRightPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Add a class to body to prevent text selection and show resizing cursor globally
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Refs for shortcuts
  const filesRef = useRef(files);
  const selectedFileIndexRef = useRef(selectedFileIndex);
  const commitMessageTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { selectedFileIndexRef.current = selectedFileIndex; }, [selectedFileIndex]);

  // Keep selected file index in bounds
  useEffect(() => {
    if (selectedFileIndex !== undefined) {
      if (files.length === 0) setSelectedFileIndex(undefined);
      else if (selectedFileIndex >= files.length) setSelectedFileIndex(files.length - 1);
    }
  }, [files.length, selectedFileIndex]);

  const uiStateWithQueuedLoading = {
    ...uiState,
    withLoading: async (message: string, fn: () => Promise<void>) => {
      setIsLoading(true);
      setLoadingMessage(message);
      try {
        await runQueued(fn);
      } finally {
        setIsLoading(false);
        setLoadingMessage(undefined);
      }
    }
  };

  const gitOps = useGitOperations({
    gitState,
    uiState: uiStateWithQueuedLoading,
    refs: { filesRef, setCommitMessage }
  });

  const {
    handleCommit,
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
    handleAbortMerge,
    handleResolveFiles,
    handleResolveConflict,
    handleSwitchRepo,
    handleOpenNewRepo,
    handleCheckout,
    handleCreateBranch,
    handleDeleteBranch,
    handleRevertCommit,
    handleResetCommits,
    handleConfirmReset,
    handleOpenRepo,
    handleCancelOperation
  } = gitOps;

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

      const path = await loadRepository();
      if (path) {
        await refreshAllData(path);
      }
      // Small delay to ensure smooth transition
      setTimeout(() => setShowSplash(false), 500);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array as this should only run once

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

  const commitMessageRef = useRef(commitMessage);
  useEffect(() => { commitMessageRef.current = commitMessage; }, [commitMessage]);

  useKeyboardShortcuts({
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
    performFetch: gitState.performFetch,
    handleCommit,
    refreshStatusInternal,
    refreshHistoryInternal,
    refreshBranchStatusInternal,
    refreshBranchesInternal,
    withLoading: uiStateWithQueuedLoading.withLoading,
    addLog,
  });

  return (
    <div className="h-screen bg-background text-foreground p-4 flex flex-col gap-4">
      <SplashScreen visible={showSplash} />
      {isLoading && (
        <LoadingOverlay 
          message={loadingMessage} 
          onCancel={handleCancelOperation}
        />
      )}

      <div className="flex-none">
        <RepoHeader
          repoName={repoName}
          currentBranch={currentBranch}
          hasCredentials={hasCredentials}
          branchStatus={branchStatus}
          isDisabled={isRefreshingBranches}
          canStash={files.length > 0}
          isShowingGraphs={showGraphs}
          onSwitchRepo={handleSwitchRepo}
          onOpenNew={handleOpenNewRepo}
          onOpenSettings={() => setShowSettingsDialog(true)}
          onPush={handlePush}
          onPull={handlePull}
          onStash={handleStash}
          onToggleGraphs={() => setShowGraphs(!showGraphs)}
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

      <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-row">
        {showGraphs && repoName ? (
          <div className="flex-1 h-full overflow-hidden flex flex-col min-w-0">
            <GraphsView />
          </div>
        ) : (
          <>
            {/* Column 1: Left Sidebar - Branches & Tags */}
            {repoName && showLeftPanel && (
              <>
                <div style={{ width: leftPanelWidth }} className="flex flex-col h-full overflow-y-auto min-w-0 min-h-0 scrollbar-none pr-2 shrink-0">
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
                  <div className="mt-4 pb-4">
                    <TagsPanel
                      onSetLoading={(loading, message) => {
                        setIsLoading(loading);
                        setLoadingMessage(message);
                      }}
                    />
                  </div>
                </div>
                
                {/* Drag Handle Left */}
                <div
                  className="relative flex w-1 cursor-col-resize items-center justify-center bg-transparent transition-all after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border hover:after:w-1 hover:after:bg-primary/50 group shrink-0 z-10"
                  onMouseDown={(e) => { e.preventDefault(); setIsResizing('left'); }}
                >
                  <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical className="h-2.5 w-2.5 text-muted-foreground" />
                  </div>
                </div>
              </>
            )}

            {/* Column 2: Main Content Area - Graph or Repo Selector */}
            <div className={`flex-1 h-full w-full flex flex-col min-w-0 ${showLeftPanel ? 'pl-2' : ''} ${showBottomPanel ? 'pr-2' : ''}`}>
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

            {/* Column 3: Right Sidebar - Changes & Activity Log */}
            {repoName && showBottomPanel && (
              <>
                {/* Drag Handle Right */}
                <div
                  className="relative flex w-1 cursor-col-resize items-center justify-center bg-transparent transition-all after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border hover:after:w-1 hover:after:bg-primary/50 group shrink-0 z-10"
                  onMouseDown={(e) => { e.preventDefault(); setIsResizing('right'); }}
                >
                  <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical className="h-2.5 w-2.5 text-muted-foreground" />
                  </div>
                </div>

                <div style={{ width: rightPanelWidth }} className="flex flex-col h-full min-w-0 min-h-0 pl-2 shrink-0">
                  <div className="flex-1 min-h-0">
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
                  <div className="h-[25%] min-h-[150px] flex-none mt-4">
                    <ActivityLog logs={logs} />
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {!repoName ? (
        <div className="flex-none max-h-[50vh] flex flex-col">
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
