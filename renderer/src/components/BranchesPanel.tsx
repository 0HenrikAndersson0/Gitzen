import { useState, useEffect } from 'react';
import { GitBranch, GitMerge, Tag, Trash2, Plus, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';

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
}

export function BranchesPanel({ 
  currentBranch, 
  onCheckout, 
  onCreateBranch,
  onDeleteBranch,
  onDeleteTag 
}: BranchesPanelProps) {
  const [activeTab, setActiveTab] = useState<'local' | 'remote' | 'tags'>('local');
  const [localBranches, setLocalBranches] = useState<Branch[]>([]);
  const [remoteBranches, setRemoteBranches] = useState<Branch[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const loadBranches = async () => {
    setLoading(true);
    try {
      // Load local branches
      const localResult = await window.electronAPI.gitGetBranches();
      if (localResult.success && localResult.branches) {
        setLocalBranches(
          localResult.branches.map((name) => ({
            name,
            isRemote: false,
            isCurrent: name === currentBranch,
          }))
        );
      }

      // Load remote branches
      const remoteResult = await window.electronAPI.getRemoteBranches();
      if (remoteResult.success && remoteResult.branches) {
        setRemoteBranches(
          remoteResult.branches.map((branch) => ({
            name: `${branch.remote}/${branch.name}`,
            isRemote: true,
            isCurrent: false,
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load branches:', error);
      toast.error('Failed to load branches');
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.getTags();
      if (result.success && result.tags) {
        setTags(
          result.tags.map((tag) => ({
            name: tag.name,
            commit: tag.commit,
            date: new Date(tag.date),
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load tags:', error);
      toast.error('Failed to load tags');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'local' || activeTab === 'remote') {
      loadBranches();
    } else if (activeTab === 'tags') {
      loadTags();
    }
  }, [activeTab, currentBranch]);

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
        await loadBranches();
      } else {
        toast.error(result.error || 'Failed to create branch');
      }
    } catch (error) {
      toast.error('Failed to create branch');
      console.error('Create branch error:', error);
    }
  };

  const handleDeleteBranch = async (branchName: string) => {
    if (!confirm(`Are you sure you want to delete branch "${branchName}"?`)) {
      return;
    }

    try {
      const result = await window.electronAPI.deleteBranch(branchName, false);
      if (result.success) {
        toast.success(`Deleted branch ${branchName}`);
        onDeleteBranch?.(branchName);
        await loadBranches();
      } else {
        toast.error(result.error || 'Failed to delete branch');
      }
    } catch (error) {
      toast.error('Failed to delete branch');
    }
  };

  const handleDeleteTag = async (tagName: string) => {
    if (!confirm(`Are you sure you want to delete tag "${tagName}"?`)) {
      return;
    }

    try {
      const result = await window.electronAPI.deleteTag(tagName);
      if (result.success) {
        toast.success(`Deleted tag ${tagName}`);
        onDeleteTag?.(tagName);
        await loadTags();
      } else {
        toast.error(result.error || 'Failed to delete tag');
      }
    } catch (error) {
      toast.error('Failed to delete tag');
    }
  };

  const handleCheckout = async (branchName: string) => {
    try {
      const result = await window.electronAPI.gitCheckoutBranch(branchName);
      if (result.success) {
        toast.success(`Switched to branch ${branchName}`);
        onCheckout?.(branchName);
        await loadBranches();
      } else {
        toast.error(result.error || 'Failed to checkout branch');
      }
    } catch (error) {
      toast.error('Failed to checkout branch');
    }
  };

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
              remoteBranches.map((branch) => (
                <div
                  key={branch.name}
                  className="group flex items-center gap-3 p-3 transition-colors hover:bg-zinc-800/50"
                >
                  <GitMerge className="size-4 flex-shrink-0 text-purple-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-zinc-300">
                      {branch.name}
                    </div>
                  </div>
                </div>
              ))
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
    </div>
  );
}

