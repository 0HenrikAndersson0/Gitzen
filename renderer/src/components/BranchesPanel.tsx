import { useState, useEffect, useCallback, useRef } from 'react';
import { GitBranch, GitMerge, Trash2, Plus, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { StashList } from './StashList';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { RebaseModal } from './RebaseModal';

interface Branch {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  lastCommit?: string;
}

interface BranchesPanelProps {
  currentBranch: string;
  stashes: { name: string; message: string }[];
  onCheckout?: (branch: string) => void;
  onCreateBranch?: (name: string) => void;
  onDeleteBranch?: (branch: string) => void;
  onMergeBranch?: (branch: string) => void;
  onSetLoading?: (loading: boolean, message?: string) => void;
  onApplyStash: (name: string) => void;
  onDeleteStash: (name: string) => void;
}

export function BranchesPanel({
  currentBranch,
  stashes,
  onCheckout,
  onCreateBranch,
  onDeleteBranch,
  onMergeBranch,
  onSetLoading,
  onApplyStash,
  onDeleteStash,
}: BranchesPanelProps) {
  const [activeTab, setActiveTab] = useState<'local' | 'remote'>('local');
  const [localBranches, setLocalBranches] = useState<Branch[]>([]);
  const [remoteBranches, setRemoteBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; branch: string } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ type: 'branch' | 'remoteBranch'; name: string } | null>(null);
  const [rebaseModalOpen, setRebaseModalOpen] = useState(false);
  const [rebaseTargetBranch, setRebaseTargetBranch] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadBranches = useCallback(async (showLoading: boolean = false) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      // Load local branches, remote branches in parallel
      const [localResult, remoteResult] = await Promise.all([
        window.electronAPI.gitGetBranches(),
        window.electronAPI.getRemoteBranches(),
      ]);

      // Process local branches
      if (localResult.success && localResult.branches) {
        const newLocalBranches = localResult.branches.map((name) => ({
          name,
          isRemote: false,
          isCurrent: name === currentBranch,
        }));
        
        // Only update state if branches actually changed
        setLocalBranches((prev) => {
          const prevNames = prev.map(b => b.name).sort().join(',');
          const newNames = newLocalBranches.map(b => b.name).sort().join(',');
          const prevCurrent = prev.find(b => b.isCurrent)?.name;
          const newCurrent = newLocalBranches.find(b => b.isCurrent)?.name;
          
          // Update if branch list changed or current branch changed
          if (prevNames !== newNames || prevCurrent !== newCurrent) {
            return newLocalBranches;
          }
          return prev;
        });
      }

      // Process remote branches
      if (remoteResult.success && remoteResult.branches) {
        const newRemoteBranches = remoteResult.branches.map((branch) => ({
          name: `${branch.remote}/${branch.name}`,
          isRemote: true,
          isCurrent: false,
        }));
        
        // Only update state if branches actually changed
        setRemoteBranches((prev) => {
          const prevNames = prev.map(b => b.name).sort().join(',');
          const newNames = newRemoteBranches.map(b => b.name).sort().join(',');
          
          if (prevNames !== newNames) {
            return newRemoteBranches;
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('Failed to load branches:', error);
      if (showLoading) {
        toast.error('Failed to load branches');
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [currentBranch]);

  useEffect(() => {
    // Always load branches together, regardless of active tab
    loadBranches(true); // Show loading on initial load or tab switch
    // Only depend on activeTab and currentBranch - the functions are stable via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentBranch]);

  // Memoize the refresh function to avoid recreating it on every render
  const refreshCurrentTab = useCallback(async () => {
    // Always refresh branches together (silent refresh, no loading indicator)
    await loadBranches(false);
  }, [loadBranches]);

  // Auto-refresh branches every 10 seconds
  // Refresh based on the currently active tab
  useAutoRefresh({
    enabled: true, // Always enabled when component is mounted
    intervalMs: 10000, // 10 seconds
    refreshFunctions: [refreshCurrentTab],
  });

  const handleCreateBranchClick = () => {
    setNewBranchName('');
    setShowCreateDialog(true);
  };

  const handleCreateBranch = async () => {
    const name = newBranchName.trim();
    if (!name) {
      toast.error('Branch name cannot be empty');
      return;
    }

    // Validate branch name (basic validation)
    if (!/^[a-zA-Z0-9/_-]+$/.test(name)) {
      toast.error('Branch name contains invalid characters');
      return;
    }

    try {
      const result = await window.electronAPI.gitCreateBranch(name, true);
      if (result.success) {
        toast.success(`Created and checked out branch ${name}`);
        onCreateBranch?.(name);
        setShowCreateDialog(false);
        setNewBranchName('');
        await loadBranches(true);
      } else {
        toast.error(result.error || 'Failed to create branch');
      }
    } catch (error) {
      toast.error('Failed to create branch');
      console.error('Create branch error:', error);
    }
  };

  const handleDeleteBranch = async (branchName: string) => {
    setDeleteDialog({ type: 'branch', name: branchName });
  };

  const handleDeleteRemoteBranch = async (remoteBranchName: string) => {
    setDeleteDialog({ type: 'remoteBranch', name: remoteBranchName });
  };

  const confirmDelete = async () => {
    if (!deleteDialog) return;

    // Capture the dialog state to avoid stale closures
    const dialogToDelete = deleteDialog;
    
    // Close dialog immediately to provide better UX
    setDeleteDialog(null);
    onSetLoading?.(true, `Deleting ${dialogToDelete.name}...`);

    try {
      let result;
      if (dialogToDelete.type === 'branch') {
        result = await (window.electronAPI as any).deleteBranch(dialogToDelete.name, false);
        if (result.success) {
          toast.success(`Deleted branch ${dialogToDelete.name}`);
          onDeleteBranch?.(dialogToDelete.name);
          await loadBranches(true);
        } else {
          toast.error(result.error || 'Failed to delete branch');
        }
      } else if (dialogToDelete.type === 'remoteBranch') {
        result = await (window.electronAPI as any).deleteRemoteBranch(dialogToDelete.name);
        if (result.success) {
          const branchName = extractBranchNameFromRemote(dialogToDelete.name);
          toast.success(`Deleted remote branch ${branchName}`);
          await loadBranches(true);
        } else {
          toast.error(result.error || 'Failed to delete remote branch');
        }
      }
    } catch (error) {
      const itemType = dialogToDelete.type === 'branch' ? 'branch' : 'remote branch';
      toast.error(`Failed to delete ${itemType}`);
    } finally {
      onSetLoading?.(false);
    }
  };

  // Helper function to extract branch name from remote/branch format
  // Handles cases like: origin/feature/dev/something -> feature/dev/something
  const extractBranchNameFromRemote = (remoteBranchName: string): string => {
    const firstSlashIndex = remoteBranchName.indexOf('/');
    if (firstSlashIndex === -1) {
      return remoteBranchName; // No slash, it's already just the branch name
    }
    return remoteBranchName.substring(firstSlashIndex + 1);
  };

  const handleCheckout = async (branchName: string) => {
    try {
      // Check if this is a remote branch by checking if it exists in remoteBranches
      const isRemoteBranch = remoteBranches.some(b => b.name === branchName);
      
      const result = await window.electronAPI.gitCheckoutBranch(branchName);
      if (result.success) {
        // Extract just the branch name if it's a remote branch (removes remote/ prefix)
        const displayName = isRemoteBranch ? extractBranchNameFromRemote(branchName) : branchName;
        toast.success(`Switched to branch ${displayName}`);
        onCheckout?.(branchName);
        await loadBranches(true);
        
        // Switch to local tab if we checked out a remote branch
        if (isRemoteBranch) {
          setActiveTab('local');
        }
      } else {
        toast.error(result.error || 'Failed to checkout branch');
      }
    } catch (error) {
      toast.error('Failed to checkout branch');
    }
  };

  const handleContextMenu = (e: React.MouseEvent, branchName: string) => {
    if (branchName !== currentBranch) {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        branch: branchName,
      });
    }
  };

  const handleMenuAction = (action: 'merge' | 'rebase' | 'interactive-rebase') => {
    if (!contextMenu) return;

    const branch = contextMenu.branch;
    
    switch (action) {
      case 'merge':
        onMergeBranch?.(branch);
        break;
      case 'rebase':
        // Direct rebase call
        onSetLoading?.(true, `Rebasing onto ${branch}...`);
        window.electronAPI.gitRebaseBranch(branch).then(result => {
           if (result.success) {
             toast.success(`Successfully rebased current branch onto ${branch}`);
           } else {
             if (result.error && result.error.includes('conflict')) {
                toast.warning('Rebase started but encountered conflicts. Please resolve them.');
                // App.tsx should pick up the conflict state via gitStatus polling
             } else {
                toast.error(`Rebase failed: ${result.error}`);
             }
           }
        }).catch(err => {
           toast.error(`Rebase failed: ${err.message}`);
        }).finally(() => {
           onSetLoading?.(false);
        });
        break;
      case 'interactive-rebase':
        setRebaseTargetBranch(branch);
        setRebaseModalOpen(true);
        break;
    }

    setContextMenu(null);
  };

  const handleStartInteractiveRebase = async (targetBranch: string, todoLines: string[]) => {
      onSetLoading?.(true, 'Starting interactive rebase...');
      try {
        const result = await window.electronAPI.gitInteractiveRebase(targetBranch, todoLines);
        if (result.success) {
           toast.success('Interactive rebase started successfully');
        } else {
           if (result.error && result.error.includes('conflict')) {
              toast.warning('Rebase encountered conflicts. Please resolve them.');
           } else {
              toast.error(`Rebase failed: ${result.error}`);
           }
        }
      } catch (error: any) {
        toast.error(`Rebase failed: ${error.message}`);
      } finally {
        onSetLoading?.(false);
      }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  return (
    <div className="flex flex-col gap-4">
      {/* Local Branches Panel */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 flex flex-col">
        <div className="border-b border-zinc-800 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-100">
            <GitBranch className="size-4" />
            <h3 className="font-semibold text-sm">Local Branches</h3>
          </div>
          <button
            onClick={handleCreateBranchClick}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600/10 px-2 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-600/20"
          >
            <Plus className="size-3" />
            New
          </button>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {loading && localBranches.length === 0 ? (
            <div className="p-4 text-center text-sm text-zinc-500">Loading...</div>
          ) : localBranches.length === 0 ? (
            <div className="p-4 text-center text-sm text-zinc-500">No local branches</div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {localBranches.map((branch) => (
                <div
                  key={branch.name}
                  className="group flex items-center justify-between p-2.5 transition-colors hover:bg-zinc-800/50"
                  onContextMenu={(e) => handleContextMenu(e, branch.name)}
                >
                  <button
                    onClick={() => !branch.isCurrent && handleCheckout(branch.name)}
                    className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                    disabled={branch.isCurrent}
                  >
                    <GitBranch className={`size-3.5 flex-shrink-0 mt-0.5 ${branch.isCurrent ? 'text-blue-400' : 'text-zinc-500'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`truncate text-sm ${branch.isCurrent ? 'text-blue-400 font-medium' : 'text-zinc-300'}`}>
                          {branch.name}
                        </span>
                        {branch.isCurrent && (
                          <CheckCircle2 className="size-3 flex-shrink-0 text-blue-400" />
                        )}
                      </div>
                    </div>
                  </button>
                  {!branch.isCurrent && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBranch(branch.name);
                      }}
                      className="ml-2 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5 text-red-400 hover:text-red-300" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Remote Branches Panel */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 flex flex-col">
        <div className="border-b border-zinc-800 p-3 flex items-center gap-2 text-zinc-100">
          <GitMerge className="size-4" />
          <h3 className="font-semibold text-sm">Remote Branches</h3>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {loading && remoteBranches.length === 0 ? (
            <div className="p-4 text-center text-sm text-zinc-500">Loading...</div>
          ) : remoteBranches.length === 0 ? (
            <div className="p-4 text-center text-sm text-zinc-500">No remote branches</div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {remoteBranches.map((branch) => {
                const branchName = extractBranchNameFromRemote(branch.name);
                const isLocalBranch = localBranches.some(b => b.name === branchName);
                
                return (
                  <div
                    key={branch.name}
                    className="group flex items-center justify-between p-2.5 transition-colors hover:bg-zinc-800/50"
                  >
                    <div
                      className="flex min-w-0 flex-1 items-start gap-2.5 cursor-pointer"
                      onClick={() => !isLocalBranch && handleCheckout(branch.name)}
                    >
                      <GitMerge className="size-3.5 flex-shrink-0 mt-0.5 text-purple-400" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-zinc-300">
                          {branch.name}
                        </div>
                        {isLocalBranch && (
                          <div className="text-[10px] text-zinc-500">
                            Local branch exists
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRemoteBranch(branch.name);
                      }}
                      className="ml-2 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5 text-red-400 hover:text-red-300" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Stashes Panel */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 flex flex-col">
        <StashList
          stashes={stashes}
          onApplyStash={onApplyStash}
          onDeleteStash={onDeleteStash}
        />
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-red-400 flex items-center gap-2">
              <Trash2 className="size-5" />
              {deleteDialog?.type === 'branch' && 'Delete Branch'}
              {deleteDialog?.type === 'remoteBranch' && 'Delete Remote Branch'}
            </DialogTitle>
            <DialogDescription className="text-zinc-400 mt-3 text-base">
              {deleteDialog?.type === 'branch' && (
                <>
                  Are you sure you want to delete the branch <span className="font-mono font-semibold text-zinc-300">{deleteDialog.name}</span>? 
                  <br />
                  <span className="text-sm text-zinc-500 mt-2 block">This action cannot be undone.</span>
                </>
              )}
              {deleteDialog?.type === 'remoteBranch' && (
                <>
                  Are you sure you want to delete the remote branch <span className="font-mono font-semibold text-zinc-300">{deleteDialog.name}</span>? 
                  <br />
                  <span className="text-sm text-zinc-500 mt-2 block">This will delete the branch on the remote repository.</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end mt-6">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog(null)}
              className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-200"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white font-medium"
            >
              <Trash2 className="size-4 mr-2" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Branch Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Create New Branch</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Enter a name for the new branch. It will be created and checked out.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="branch-name"
              className="bg-zinc-800 border-zinc-700 text-zinc-100"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateBranch();
                }
              }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewBranchName('');
                }}
                className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateBranch}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={!newBranchName.trim()}
              >
                Create Branch
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-md shadow-xl overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div
            className="px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 cursor-pointer transition-colors"
            onClick={() => handleMenuAction('merge')}
          >
            Merge to current
          </div>
          <div
            className="px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 cursor-pointer transition-colors border-t border-zinc-700"
            onClick={() => handleMenuAction('rebase')}
          >
            Rebase current onto {contextMenu.branch}
          </div>
          <div
            className="px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 cursor-pointer transition-colors"
            onClick={() => handleMenuAction('interactive-rebase')}
          >
            Interactive Rebase...
          </div>
        </div>
      )}

      {rebaseTargetBranch && (
        <RebaseModal
            isOpen={rebaseModalOpen}
            onClose={() => setRebaseModalOpen(false)}
            targetBranch={rebaseTargetBranch}
            currentBranch={currentBranch}
            onStartRebase={handleStartInteractiveRebase}
        />
      )}
    </div>
  );
}

