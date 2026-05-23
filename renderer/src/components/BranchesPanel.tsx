import { useState, useEffect, useRef, memo, useMemo } from 'react';
import { GitBranch, GitMerge, Trash2, Plus, CheckCircle2, ArrowUp, ArrowDown, ChevronDown, ChevronRight, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { StashList } from './StashList';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { RebaseModal } from './RebaseModal';
import { BranchReviewModal } from './BranchReviewModal';

export interface Branch {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  ahead?: number;
  behind?: number;
  upstream?: string;
}

interface BranchesPanelProps {
  currentBranch: string;
  localBranches: Branch[];
  remoteBranches: Branch[];
  stashes: { name: string; message: string }[];
  loading?: boolean;
  onCheckout?: (branch: string) => void;
  onCreateBranch?: (name: string) => void;
  onDeleteBranch?: (branch: string) => void;
  onDeleteRemoteBranch?: (branch: string) => void;
  onMergeBranch?: (branch: string) => void;
  onSetLoading?: (loading: boolean, message?: string) => void;
  onApplyStash: (name: string) => void;
  onDeleteStash: (name: string) => void;
  onRefresh?: () => void;
  isCreateDialogOpen?: boolean;
  onCloseCreateDialog?: () => void;
  onOpenCreateDialog?: () => void;
  onFinishGitFlow?: (type: 'feature' | 'bugfix' | 'release' | 'hotfix' | 'support', name: string) => void;
}

const extractBranchNameFromRemote = (remoteBranchName: string): string => {
  const firstSlashIndex = remoteBranchName.indexOf('/');
  if (firstSlashIndex === -1) {
    return remoteBranchName;
  }
  return remoteBranchName.substring(firstSlashIndex + 1);
};

const groupBranches = (branches: Branch[], filter: string) => {
  const filtered = branches.filter(b => b.name.toLowerCase().includes(filter.toLowerCase()));
  const groups: Record<string, Branch[]> = {};
  const root: Branch[] = [];

  filtered.forEach(branch => {
    const parts = branch.name.split('/');
    if (parts.length > 1) {
      const groupName = parts[0];
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(branch);
    } else {
      root.push(branch);
    }
  });

  return { groups, root };
};

const groupRemoteBranches = (branches: Branch[], filter: string) => {
  const filtered = branches.filter(b => b.name.toLowerCase().includes(filter.toLowerCase()));
  const groups: Record<string, Branch[]> = {};
  const root: Branch[] = [];

  filtered.forEach(branch => {
    const logicalName = extractBranchNameFromRemote(branch.name);
    const parts = logicalName.split('/');
    if (parts.length > 1) {
      const groupName = parts[0];
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(branch);
    } else {
      root.push(branch);
    }
  });

  return { groups, root };
};

export const BranchesPanel = memo(function BranchesPanel({
  currentBranch,
  localBranches,
  remoteBranches,
  stashes,
  loading,
  onCheckout,
  onCreateBranch,
  onDeleteBranch,
  onDeleteRemoteBranch,
  onMergeBranch,
  onSetLoading,
  onApplyStash,
  onDeleteStash,
  onRefresh,
  isCreateDialogOpen,
  onCloseCreateDialog,
  onOpenCreateDialog,
  onFinishGitFlow
}: BranchesPanelProps) {
  const [internalShowCreateDialog, setInternalShowCreateDialog] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; branch: string; upstream?: string; isRemote: boolean; isCurrent: boolean } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ type: 'branch' | 'remoteBranch'; name: string } | null>(null);
  const [renameDialog, setRenameDialog] = useState<{ isOpen: boolean; oldName: string; newName: string }>({ isOpen: false, oldName: '', newName: '' });
  const [rebaseModalOpen, setRebaseModalOpen] = useState(false);
  const [rebaseTargetBranch, setRebaseTargetBranch] = useState<string | null>(null);
  const [reviewBranchName, setReviewBranchName] = useState<string | null>(null);
  const [localBranchesExpanded, setLocalBranchesExpanded] = useState(true);
  const [remoteBranchesExpanded, setRemoteBranchesExpanded] = useState(true);
  const [expandedLocalGroups, setExpandedLocalGroups] = useState<Record<string, boolean>>({});
  const [expandedRemoteGroups, setExpandedRemoteGroups] = useState<Record<string, boolean>>({});
  const [localFilter, setLocalFilter] = useState('');
  const [remoteFilter, setRemoteFilter] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const localGrouped = useMemo(() => groupBranches(localBranches, localFilter), [localBranches, localFilter]);
  const remoteGrouped = useMemo(() => groupRemoteBranches(remoteBranches, remoteFilter), [remoteBranches, remoteFilter, localBranches]);

  useEffect(() => {
    if (localFilter.trim()) {
      const groups = Object.keys(localGrouped.groups);
      if (groups.length > 0) {
        setExpandedLocalGroups(prev => {
          const next = { ...prev };
          groups.forEach(g => { next[g] = true; });
          return next;
        });
      }
    } else {
      setExpandedLocalGroups({});
    }
  }, [localFilter, localGrouped.groups]);

  useEffect(() => {
    if (remoteFilter.trim()) {
      const groups = Object.keys(remoteGrouped.groups);
      if (groups.length > 0) {
        setExpandedRemoteGroups(prev => {
          const next = { ...prev };
          groups.forEach(g => { next[g] = true; });
          return next;
        });
      }
    } else {
      setExpandedRemoteGroups({});
    }
  }, [remoteFilter, remoteGrouped.groups]);

  const toggleLocalGroup = (group: string) => {
    setExpandedLocalGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const toggleRemoteGroup = (group: string) => {
    setExpandedRemoteGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const isDialogOpen = isCreateDialogOpen !== undefined ? isCreateDialogOpen : internalShowCreateDialog;
  const closeDialog = onCloseCreateDialog || (() => setInternalShowCreateDialog(false));
  const openDialog = onOpenCreateDialog || (() => setInternalShowCreateDialog(true));

  const handleCreateBranchClick = () => {
    setNewBranchName('');
    openDialog();
  };

  const handleCreateBranch = async () => {
    const name = newBranchName.trim();
    if (!name) {
      toast.error('Branch name cannot be empty');
      return;
    }

    if (!/^[a-zA-Z0-9/_-]+$/.test(name)) {
      toast.error('Branch name contains invalid characters');
      return;
    }

    onCreateBranch?.(name);
    closeDialog();
    setNewBranchName('');
  };

  const handleDeleteBranch = async (branchName: string) => {
    setDeleteDialog({ type: 'branch', name: branchName });
  };

  const handleDeleteRemoteBranch = async (remoteBranchName: string) => {
    setDeleteDialog({ type: 'remoteBranch', name: remoteBranchName });
  };

  const confirmDelete = async () => {
    if (!deleteDialog) return;

    const dialogToDelete = deleteDialog;
    setDeleteDialog(null);

    if (dialogToDelete.type === 'branch' && onDeleteBranch) {
      onDeleteBranch(dialogToDelete.name);
      return;
    }

    if (dialogToDelete.type === 'remoteBranch' && onDeleteRemoteBranch) {
      onDeleteRemoteBranch(dialogToDelete.name);
      return;
    }

    onSetLoading?.(true, `Deleting ${dialogToDelete.name}...`);

    try {
      let result;
      if (dialogToDelete.type === 'branch') {
        result = await window.electronAPI.deleteBranch(dialogToDelete.name, false);
        if (result.success) {
          toast.success(`Deleted branch ${dialogToDelete.name}`);
          onRefresh?.();
        } else {
          toast.error(result.error || 'Failed to delete branch');
        }
      } else if (dialogToDelete.type === 'remoteBranch') {
        result = await window.electronAPI.deleteRemoteBranch(dialogToDelete.name);
        if (result.success) {
          toast.success(`Deleted remote branch ${dialogToDelete.name}`);
          onRefresh?.();
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

  const handleCheckout = async (branchName: string) => {
    onCheckout?.(branchName);
  };

  const handleContextMenu = (e: React.MouseEvent, branch: Branch) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      branch: branch.name,
      upstream: branch.upstream,
      isRemote: branch.isRemote,
      isCurrent: !!branch.isCurrent
    });
  };

  const handleMenuAction = async (action: 'merge' | 'rebase' | 'interactive-rebase' | 'fetch' | 'pull' | 'rename' | 'review-changes') => {
    if (!contextMenu) return;

    const branch = contextMenu.branch;
    const upstream = contextMenu.upstream;
    const isRemote = contextMenu.isRemote;

    switch (action) {
      case 'review-changes':
        setReviewBranchName(branch);
        break;
      case 'rename':
        setRenameDialog({ isOpen: true, oldName: branch, newName: branch });
        break;
      case 'merge':
        onMergeBranch?.(branch);
        break;
      case 'rebase':
        onSetLoading?.(true, `Rebasing onto ${branch}...`);
        window.electronAPI.gitRebaseBranch(branch).then(result => {
          if (result.success) {
            toast.success(`Successfully rebased current branch onto ${branch}`);
          } else {
            if (result.error && result.error.includes('conflict')) {
              toast.warning('Rebase started but encountered conflicts. Please resolve them.');
            } else {
              toast.error(`Rebase failed: ${result.error}`);
            }
          }
        }).catch(err => {
          toast.error(`Rebase failed: ${err.message}`);
        }).finally(() => {
          onRefresh?.();
          onSetLoading?.(false);
        });
        break;
      case 'interactive-rebase':
        setRebaseTargetBranch(branch);
        setRebaseModalOpen(true);
        break;
      case 'fetch':
        // Determine remote from upstream or branch name or default to origin
        let fetchRemote = 'origin';
        if (upstream) {
          const parts = upstream.split('/');
          if (parts.length > 0) fetchRemote = parts[0];
        } else if (isRemote && branch.includes('/')) {
          fetchRemote = branch.split('/')[0];
        }

        onSetLoading?.(true, `Fetching ${fetchRemote}...`);
        try {
          const result = await window.electronAPI.gitFetch(fetchRemote);
          if (result.success) {
            toast.success(`Successfully fetched from ${fetchRemote}`);
            onRefresh?.();
          } else {
            toast.error(`Fetch failed: ${result.error}`);
          }
        } catch (err: any) {
          toast.error(`Fetch failed: ${err.message}`);
        } finally {
          onSetLoading?.(false);
        }
        break;
      case 'pull':
        // Determine remote and branch from upstream or branch name or default to origin
        let pullRemote = 'origin';
        let pullBranch = branch;

        if (upstream) {
          const parts = upstream.split('/');
          if (parts.length > 1) {
            pullRemote = parts[0];
            pullBranch = parts.slice(1).join('/');
          }
        } else if (isRemote && branch.includes('/')) {
          // If it's a remote branch, parse remote/branch
          const parts = branch.split('/');
          pullRemote = parts[0];
          pullBranch = parts.slice(1).join('/');
        }
        // If it's a local branch without upstream, we default to origin and branch name.
        // This handles cases like 'feature/login' correctly (remote='origin', branch='feature/login')

        onSetLoading?.(true, `Pulling ${pullRemote}/${pullBranch}...`);
        try {
          // Pass the local branch name ('branch') as the target branch
          const result = await window.electronAPI.gitPull(pullRemote, pullBranch, branch);
          if (result.success) {
            toast.success(`Successfully pulled ${pullRemote}/${pullBranch}`);
            onRefresh?.();
          } else {
            toast.error(`Pull failed: ${result.error}`);
          }
        } catch (err: any) {
          toast.error(`Pull failed: ${err.message}`);
        } finally {
          onSetLoading?.(false);
        }
        break;
    }

    setContextMenu(null);
  };

  const submitRename = async () => {
    const { oldName, newName } = renameDialog;
    const finalNewName = newName.trim();
    
    if (!finalNewName) {
      toast.error('Branch name cannot be empty');
      return;
    }
    if (finalNewName === oldName) {
      setRenameDialog({ isOpen: false, oldName: '', newName: '' });
      return;
    }
    if (!/^[a-zA-Z0-9/._-]+$/.test(finalNewName)) {
      toast.error('Branch name contains invalid characters');
      return;
    }

    onSetLoading?.(true, `Renaming ${oldName} to ${finalNewName}...`);
    try {
      const result = await window.electronAPI.renameBranch(oldName, finalNewName);
      if (result.success) {
        toast.success(`Renamed branch to ${finalNewName}`);
        onRefresh?.();
      } else {
        toast.error(result.error || 'Failed to rename branch');
      }
    } catch (error) {
      toast.error('Failed to rename branch');
    } finally {
      onSetLoading?.(false);
      setRenameDialog({ isOpen: false, oldName: '', newName: '' });
    }
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
      onRefresh?.();
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

  // Detect if current branch is a Git Flow branch
  const flowMatch = currentBranch.match(/^(feature|bugfix|release|hotfix|support)\/(.+)$/);
  const activeFlowType = flowMatch ? flowMatch[1] : null;
  const activeFlowName = flowMatch ? flowMatch[2] : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Git Flow Active Action (Only shows when on a flow branch) */}
      {activeFlowType && activeFlowName && onFinishGitFlow && (
        <div className="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="font-semibold text-xs text-foreground">
              Active {activeFlowType.charAt(0).toUpperCase() + activeFlowType.slice(1)}
            </h3>
          </div>
          <p className="text-[10px] text-muted-foreground font-mono truncate pl-3.5">{activeFlowName}</p>
          <Button 
            variant="secondary"
            size="sm"
            className="w-full mt-1 text-xs border border-border hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            onClick={() => onFinishGitFlow(activeFlowType as any, activeFlowName)}
          >
            <CheckCircle2 className="size-3 mr-1.5" />
            Finish {activeFlowType}
          </Button>
        </div>
      )}

      {/* Local Branches Panel */}
      <div className="rounded-lg border border-border bg-card/50 flex flex-col">
        <div className="border-b border-border p-3 flex items-center justify-between cursor-pointer hover:bg-accent/30 transition-colors"
          onClick={() => setLocalBranchesExpanded(!localBranchesExpanded)}>
          <div className="flex items-center gap-2 text-foreground">
            {localBranchesExpanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
            <GitBranch className="size-4" />
            <h3 className="font-semibold text-sm">Local Branches</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCreateBranchClick();
              }}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors bg-secondary text-foreground hover:bg-muted dark:bg-emerald-600/10 dark:text-emerald-400 dark:hover:bg-emerald-600/20"
            >
              <Plus className="size-3" />
              New
            </button>
          </div>
        </div>
        {localBranchesExpanded && (
          <div className="flex flex-col">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input
                  value={localFilter}
                  onChange={(e) => setLocalFilter(e.target.value)}
                  placeholder="Filter local branches..."
                  className="h-7 pl-7 text-xs bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-zinc-700"
                />
              </div>
            </div>
            {loading && localBranches.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
            ) : (
              <div className="divide-y divide-border">
                {/* Branch Groups */}
                {Object.entries(localGrouped.groups).sort(([a], [b]) => a.localeCompare(b)).map(([groupName, branches]) => {
                  const isExpanded = !!expandedLocalGroups[groupName];
                  return (
                    <div key={`group-${groupName}`} className="flex flex-col">
                      <div 
                        className="flex items-center gap-2 p-2 hover:bg-accent/30 cursor-pointer text-muted-foreground transition-colors group"
                        onClick={() => toggleLocalGroup(groupName)}
                      >
                        {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                        <span className="text-xs font-medium uppercase tracking-wider">{groupName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary/50 group-hover:bg-secondary transition-colors">
                          {branches.length}
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="flex flex-col bg-accent/10 border-l border-border ml-3">
                          {branches.map((branch) => (
                            <div
                              key={branch.name}
                              className="group/item flex items-center justify-between p-2.5 transition-colors hover:bg-accent/50"
                              onContextMenu={(e) => handleContextMenu(e, branch)}
                            >
                              <button
                                onClick={() => !branch.isCurrent && handleCheckout(branch.name)}
                                className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                                disabled={branch.isCurrent}
                              >
                                <GitBranch className={`size-3.5 flex-shrink-0 mt-0.5 ${branch.isCurrent ? 'text-info' : 'text-muted-foreground'}`} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`truncate text-sm ${branch.isCurrent ? 'text-info font-medium' : 'text-foreground'}`}>
                                      {branch.name}
                                    </span>
                                    {branch.isCurrent && (
                                      <CheckCircle2 className="size-3 flex-shrink-0 text-info" />
                                    )}
                                    {/* Ahead/Behind Indicators */}
                                    {(branch.ahead || 0) > 0 && (
                                      <div className="flex items-center gap-0.5 text-[10px] text-foreground bg-secondary px-1 rounded">
                                        <ArrowUp className="size-2.5" />
                                        {branch.ahead}
                                      </div>
                                    )}
                                    {(branch.behind || 0) > 0 && (
                                      <div className="flex items-center gap-0.5 text-[10px] text-amber-400 bg-amber-950/30 px-1 rounded">
                                        <ArrowDown className="size-2.5" />
                                        {branch.behind}
                                      </div>
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
                                  className="ml-2 flex-shrink-0 opacity-0 transition-opacity group-hover/item:opacity-100"
                                >
                                  <Trash2 className="size-3.5 text-red-400 hover:text-red-300" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Root Level Local Branches */}
                {localGrouped.root.map((branch) => (
                  <div
                    key={branch.name}
                    className="group flex items-center justify-between p-2.5 transition-colors hover:bg-accent/50"
                    onContextMenu={(e) => handleContextMenu(e, branch)}
                  >
                    <button
                      onClick={() => !branch.isCurrent && handleCheckout(branch.name)}
                      className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                      disabled={branch.isCurrent}
                    >
                      <GitBranch className={`size-3.5 flex-shrink-0 mt-0.5 ${branch.isCurrent ? 'text-info' : 'text-muted-foreground'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`truncate text-sm ${branch.isCurrent ? 'text-info font-medium' : 'text-foreground'}`}>
                            {branch.name}
                          </span>
                          {branch.isCurrent && (
                            <CheckCircle2 className="size-3 flex-shrink-0 text-info" />
                          )}
                          {/* Ahead/Behind Indicators */}
                          {(branch.ahead || 0) > 0 && (
                            <div className="flex items-center gap-0.5 text-[10px] text-foreground bg-secondary px-1 rounded">
                              <ArrowUp className="size-2.5" />
                              {branch.ahead}
                            </div>
                          )}
                          {(branch.behind || 0) > 0 && (
                            <div className="flex items-center gap-0.5 text-[10px] text-amber-400 bg-amber-950/30 px-1 rounded">
                              <ArrowDown className="size-2.5" />
                              {branch.behind}
                            </div>
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
        )}
      </div>

      {/* Remote Branches Panel */}
      <div className="rounded-lg border border-border bg-card/50 flex flex-col">
        <div className="border-b border-border p-3 flex items-center gap-2 text-foreground cursor-pointer hover:bg-accent/30 transition-colors"
          onClick={() => setRemoteBranchesExpanded(!remoteBranchesExpanded)}>
          {remoteBranchesExpanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
          <GitMerge className="size-4" />
          <h3 className="font-semibold text-sm">Remote Branches</h3>
        </div>
        {remoteBranchesExpanded && (
          <div className="flex flex-col">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input
                  value={remoteFilter}
                  onChange={(e) => setRemoteFilter(e.target.value)}
                  placeholder="Filter remote branches..."
                  className="h-7 pl-7 text-xs bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-zinc-700"
                />
              </div>
            </div>
            {loading && remoteBranches.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
            ) : (
              <div className="divide-y divide-border">
                {/* Branch Groups */}
                {Object.entries(remoteGrouped.groups).sort(([a], [b]) => a.localeCompare(b)).map(([groupName, branches]) => {
                  const isExpanded = !!expandedRemoteGroups[groupName];
                  return (
                    <div key={`remote-group-${groupName}`} className="flex flex-col">
                      <div 
                        className="flex items-center gap-2 p-2 hover:bg-accent/30 cursor-pointer text-muted-foreground transition-colors group"
                        onClick={() => toggleRemoteGroup(groupName)}
                      >
                        {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                        <span className="text-xs font-medium uppercase tracking-wider">{groupName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary/50 group-hover:bg-secondary transition-colors">
                          {branches.length}
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="flex flex-col bg-accent/10 border-l border-border ml-3">
                          {branches.map((branch) => {
                            const branchName = extractBranchNameFromRemote(branch.name);
                            const isLocalBranch = localBranches.some(b => b.name === branchName);
                            return (
                              <div
                                key={branch.name}
                                className="group/item flex items-center justify-between p-2.5 transition-colors hover:bg-accent/50"
                                onContextMenu={(e) => handleContextMenu(e, branch)}
                              >
                                <div
                                  className="flex min-w-0 flex-1 items-start gap-2.5 cursor-pointer"
                                  onClick={() => !isLocalBranch && handleCheckout(branch.name)}
                                >
                                  <GitMerge className="size-3.5 flex-shrink-0 mt-0.5 text-accent-purple" />
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm text-foreground">
                                      {branch.name}
                                    </div>
                                    {isLocalBranch && (
                                      <div className="text-[10px] text-muted-foreground">
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
                                  className="ml-2 flex-shrink-0 opacity-0 transition-opacity group-hover/item:opacity-100"
                                >
                                  <Trash2 className="size-3.5 text-red-400 hover:text-red-300" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Root Level Remote Branches */}
                {remoteGrouped.root.map((branch) => {
                  const branchName = extractBranchNameFromRemote(branch.name);
                  const isLocalBranch = localBranches.some(b => b.name === branchName);

                  return (
                    <div
                      key={branch.name}
                      className="group flex items-center justify-between p-2.5 transition-colors hover:bg-accent/50"
                      onContextMenu={(e) => handleContextMenu(e, branch)}
                    >
                      <div
                        className="flex min-w-0 flex-1 items-start gap-2.5 cursor-pointer"
                        onClick={() => !isLocalBranch && handleCheckout(branch.name)}
                      >
                        <GitMerge className="size-3.5 flex-shrink-0 mt-0.5 text-accent-purple" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-foreground">
                            {branch.name}
                          </div>
                          {isLocalBranch && (
                            <div className="text-[10px] text-muted-foreground">
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
        )}
      </div>

      {/* Stashes Panel */}
      <div className="rounded-lg border border-border bg-card/50 flex flex-col">
        <StashList
          stashes={stashes}
          onApplyStash={onApplyStash}
          onDeleteStash={onDeleteStash}
        />
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-red-400 flex items-center gap-2">
              <Trash2 className="size-5" />
              {deleteDialog?.type === 'branch' && 'Delete Branch'}
              {deleteDialog?.type === 'remoteBranch' && 'Delete Remote Branch'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground mt-3 text-base">
              {deleteDialog?.type === 'branch' && (
                <>
                  Are you sure you want to delete the branch <span className="font-mono font-semibold text-foreground">{deleteDialog.name}</span>?
                  <br />
                  <span className="text-sm text-muted-foreground mt-2 block">This action cannot be undone.</span>
                </>
              )}
              {deleteDialog?.type === 'remoteBranch' && (
                <>
                  Are you sure you want to delete the remote branch <span className="font-mono font-semibold text-foreground">{deleteDialog.name}</span>?
                  <br />
                  <span className="text-sm text-muted-foreground mt-2 block">This will delete the branch on the remote repository.</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end mt-6">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog(null)}
              className="bg-secondary border-border text-foreground hover:bg-muted hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-medium"
            >
              <Trash2 className="size-4 mr-2" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Branch Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Create New Branch</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Enter a name for the new branch. It will be created and checked out.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="branch-name"
              className="bg-secondary border-border text-foreground"
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
                  closeDialog();
                  setNewBranchName('');
                }}
                className="bg-secondary border-border text-foreground hover:bg-muted"
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

      <Dialog open={renameDialog.isOpen} onOpenChange={(open) => {
        if (!open) {
          setRenameDialog({ isOpen: false, oldName: '', newName: '' });
        }
      }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Rename Branch</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Enter a new name for branch <span className="font-semibold text-foreground">{renameDialog.oldName}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={renameDialog.newName}
              onChange={(e) => setRenameDialog({ ...renameDialog, newName: e.target.value })}
              placeholder="new-branch-name"
              className="bg-secondary border-border text-foreground"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  submitRename();
                }
              }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRenameDialog({ isOpen: false, oldName: '', newName: '' })}
                className="bg-secondary border-border text-foreground hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                onClick={submitRename}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={!renameDialog.newName.trim()}
              >
                Rename
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-xl overflow-hidden py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div
            className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors flex items-center gap-2 border-b border-border/50 text-emerald-500 font-semibold"
            onClick={() => handleMenuAction('review-changes')}
          >
            <Sparkles className="size-3.5" />
            Review changes (AI)...
          </div>

          {contextMenu.isRemote && (
            <>
              <div
                className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors"
                onClick={() => handleMenuAction('pull')}
              >
                Pull latest changes
              </div>
              <div
                className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors"
                onClick={() => handleMenuAction('fetch')}
              >
                Fetch latest changes
              </div>
            </>
          )}

          {!contextMenu.isRemote && (
            <div
              className={`px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors ${contextMenu.isRemote ? 'border-t border-border' : ''}`}
              onClick={() => handleMenuAction('rename')}
            >
              Rename branch
            </div>
          )}

          {!contextMenu.isCurrent && (
            <>
              <div
                className={`px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors ${!contextMenu.isRemote ? 'border-t border-border' : ''}`}
                onClick={() => handleMenuAction('merge')}
              >
                Merge to current
              </div>
              <div
                className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors"
                onClick={() => handleMenuAction('rebase')}
              >
                Rebase current onto {contextMenu.branch}
              </div>
              <div
                className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors"
                onClick={() => handleMenuAction('interactive-rebase')}
              >
                Interactive Rebase...
              </div>
            </>
          )}
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

      {reviewBranchName && (
        <BranchReviewModal
          isOpen={!!reviewBranchName}
          onClose={() => setReviewBranchName(null)}
          branchName={reviewBranchName}
        />
      )}
    </div>
  );
});
