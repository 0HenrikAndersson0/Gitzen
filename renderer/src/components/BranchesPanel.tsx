import { useState, useEffect, useCallback, useRef } from 'react';
import { GitBranch, GitMerge, Tag, Trash2, Plus, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

interface Branch {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  lastCommit?: string;
}

interface TagItem {
  name: string;
  commit: string;
  date: Date;
}

interface BranchesPanelProps {
  currentBranch: string;
  onCheckout?: (branch: string) => void;
  onCreateBranch?: (name: string) => void;
  onDeleteBranch?: (branch: string) => void;
  onDeleteTag?: (tag: string) => void;
  onMergeBranch?: (branch: string) => void;
}

export function BranchesPanel({ 
  currentBranch, 
  onCheckout, 
  onCreateBranch,
  onDeleteBranch,
  onDeleteTag,
  onMergeBranch
}: BranchesPanelProps) {
  const [activeTab, setActiveTab] = useState<'local' | 'remote' | 'tags'>('local');
  const [localBranches, setLocalBranches] = useState<Branch[]>([]);
  const [remoteBranches, setRemoteBranches] = useState<Branch[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; branch: string } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ type: 'branch' | 'remoteBranch' | 'tag'; name: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadBranches = useCallback(async (showLoading: boolean = false) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      // Load local branches
      const localResult = await window.electronAPI.gitGetBranches();
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

      // Load remote branches
      const remoteResult = await window.electronAPI.getRemoteBranches();
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

  const loadTags = useCallback(async (showLoading: boolean = false) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const result = await window.electronAPI.getTags();
      if (result.success && result.tags) {
        const newTags = result.tags.map((tag) => ({
          name: tag.name,
          commit: tag.commit,
          date: new Date(tag.date),
        }));
        
        // Only update state if tags actually changed
        setTags((prev) => {
          const prevNames = prev.map(t => t.name).sort().join(',');
          const newNames = newTags.map(t => t.name).sort().join(',');
          
          if (prevNames !== newNames) {
            return newTags;
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('Failed to load tags:', error);
      if (showLoading) {
        toast.error('Failed to load tags');
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'local' || activeTab === 'remote') {
      loadBranches(true); // Show loading on initial load or tab switch
    } else if (activeTab === 'tags') {
      loadTags(true); // Show loading on initial load or tab switch
    }
    // Only depend on activeTab and currentBranch - the functions are stable via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentBranch]);

  // Memoize the refresh function to avoid recreating it on every render
  const refreshCurrentTab = useCallback(async () => {
    // Refresh branches if on local or remote tab (silent refresh, no loading indicator)
    if (activeTab === 'local' || activeTab === 'remote') {
      await loadBranches(false);
    }
    // Refresh tags if on tags tab (silent refresh, no loading indicator)
    if (activeTab === 'tags') {
      await loadTags(false);
    }
  }, [activeTab, loadBranches, loadTags]);

  // Auto-refresh branches and tags every 10 seconds
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

  const handleDeleteTag = async (tagName: string) => {
    setDeleteDialog({ type: 'tag', name: tagName });
  };

  const confirmDelete = async () => {
    if (!deleteDialog) return;

    // Capture the dialog state to avoid stale closures
    const dialogToDelete = deleteDialog;
    
    // Close dialog immediately to provide better UX
    setDeleteDialog(null);

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
      } else if (dialogToDelete.type === 'tag') {
        result = await (window.electronAPI as any).deleteTag(dialogToDelete.name);
        if (result.success) {
          toast.success(`Deleted tag ${dialogToDelete.name}`);
          onDeleteTag?.(dialogToDelete.name);
          await loadTags(true);
        } else {
          toast.error(result.error || 'Failed to delete tag');
        }
      }
    } catch (error) {
      const itemType = dialogToDelete.type === 'branch' ? 'branch' : dialogToDelete.type === 'remoteBranch' ? 'remote branch' : 'tag';
      toast.error(`Failed to delete ${itemType}`);
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

  const handleMenuAction = (action: 'merge') => {
    if (!contextMenu) return;

    const branch = contextMenu.branch;
    
    switch (action) {
      case 'merge':
        onMergeBranch?.(branch);
        break;
    }

    setContextMenu(null);
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
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
      {/* Header */}
      <div className="border-b border-zinc-800 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-zinc-100">Branches & Tags</h3>
          <button
            onClick={handleCreateBranchClick}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-600/20"
          >
            <Plus className="size-3.5" />
            New Branch
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 bg-zinc-900/30">
        <button
          onClick={() => setActiveTab('local')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'local'
              ? 'border-b-2 border-blue-500 bg-zinc-800/50 text-zinc-100'
              : 'text-zinc-400 hover:bg-zinc-800/30 hover:text-zinc-300'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <GitBranch className="size-4" />
            Local ({localBranches.length})
          </div>
        </button>
        <button
          onClick={() => setActiveTab('remote')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'remote'
              ? 'border-b-2 border-purple-500 bg-zinc-800/50 text-zinc-100'
              : 'text-zinc-400 hover:bg-zinc-800/30 hover:text-zinc-300'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <GitMerge className="size-4" />
            Remote ({remoteBranches.length})
          </div>
        </button>
        <button
          onClick={() => setActiveTab('tags')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'tags'
              ? 'border-b-2 border-amber-500 bg-zinc-800/50 text-zinc-100'
              : 'text-zinc-400 hover:bg-zinc-800/30 hover:text-zinc-300'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Tag className="size-4" />
            Tags ({tags.length})
          </div>
        </button>
      </div>

      {/* Content */}
      <div className="max-h-[400px] overflow-y-auto">
        {loading && (
          <div className="p-4 text-center text-sm text-zinc-500">Loading...</div>
        )}
        
        {!loading && activeTab === 'local' && (
          <div className="divide-y divide-zinc-800">
            {localBranches.length === 0 ? (
              <div className="p-4 text-center text-sm text-zinc-500">No local branches</div>
            ) : (
              localBranches.map((branch) => (
                <div
                  key={branch.name}
                  className="group flex items-center justify-between p-3 transition-colors hover:bg-zinc-800/50"
                  onContextMenu={(e) => handleContextMenu(e, branch.name)}
                >
                  <button
                    onClick={() => !branch.isCurrent && handleCheckout(branch.name)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    disabled={branch.isCurrent}
                  >
                    <GitBranch className={`size-4 flex-shrink-0 ${branch.isCurrent ? 'text-blue-400' : 'text-zinc-500'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`truncate text-sm font-medium ${branch.isCurrent ? 'text-blue-400' : 'text-zinc-300'}`}>
                          {branch.name}
                        </span>
                        {branch.isCurrent && (
                          <CheckCircle2 className="size-3.5 flex-shrink-0 text-blue-400" />
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
                      <Trash2 className="size-4 text-red-400 hover:text-red-300" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {!loading && activeTab === 'remote' && (
          <div className="divide-y divide-zinc-800">
            {remoteBranches.length === 0 ? (
              <div className="p-4 text-center text-sm text-zinc-500">No remote branches</div>
            ) : (
              remoteBranches.map((branch) => {
                // Extract branch name from remote/branch format (e.g., origin/feature/dev/something -> feature/dev/something)
                const branchName = extractBranchNameFromRemote(branch.name);
                const isLocalBranch = localBranches.some(b => b.name === branchName);
                
                return (
                  <div
                    key={branch.name}
                    className="group flex items-center justify-between p-3 transition-colors hover:bg-zinc-800/50"
                  >
                    <div
                      className="flex min-w-0 flex-1 items-start gap-3 cursor-pointer"
                      onClick={() => !isLocalBranch && handleCheckout(branch.name)}
                    >
                      <GitMerge className="size-4 flex-shrink-0 text-purple-400" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-zinc-300">
                          {branch.name}
                        </div>
                        {isLocalBranch && (
                          <div className="text-xs text-zinc-500 mt-0.5">
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
                      <Trash2 className="size-4 text-red-400 hover:text-red-300" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {!loading && activeTab === 'tags' && (
          <div className="divide-y divide-zinc-800">
            {tags.length === 0 ? (
              <div className="p-4 text-center text-sm text-zinc-500">No tags</div>
            ) : (
              tags.map((tag) => (
                <div
                  key={tag.name}
                  className="group flex items-center justify-between p-3 transition-colors hover:bg-zinc-800/50"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Tag className="size-4 flex-shrink-0 text-amber-400" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-zinc-300">
                        {tag.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                        <span className="font-mono">{tag.commit}</span>
                        <span>•</span>
                        <span>{tag.date.toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTag(tag.name);
                    }}
                    className="ml-2 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 className="size-4 text-red-400 hover:text-red-300" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-red-400 flex items-center gap-2">
              <Trash2 className="size-5" />
              {deleteDialog?.type === 'branch' && 'Delete Branch'}
              {deleteDialog?.type === 'remoteBranch' && 'Delete Remote Branch'}
              {deleteDialog?.type === 'tag' && 'Delete Tag'}
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
              {deleteDialog?.type === 'tag' && (
                <>
                  Are you sure you want to delete the tag <span className="font-mono font-semibold text-zinc-300">{deleteDialog.name}</span>? 
                  <br />
                  <span className="text-sm text-zinc-500 mt-2 block">This action cannot be undone.</span>
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
        </div>
      )}
    </div>
  );
}

