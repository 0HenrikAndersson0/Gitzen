import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Label } from './ui/label';
import { FolderTree, FolderOpen, Trash2, Eraser, Lock, Unlock, Plus, GitBranch } from 'lucide-react';
import { CreateWorktreeDialog } from './CreateWorktreeDialog';

interface Worktree {
  path: string;
  head: string;
  branch?: string;
  bare: boolean;
  detached: boolean;
  main: boolean;
  current: boolean;
  locked?: string;
  prunable?: string;
}

interface WorktreesPanelProps {
  worktrees: Worktree[];
  currentBranch: string;
  onCreateWorktree?: (options: { path: string; branch?: string; newBranch?: string; startPoint?: string; detach?: boolean }) => Promise<boolean>;
  onRemoveWorktree?: (path: string, force?: boolean) => void;
  onLockWorktree?: (path: string, reason?: string) => void;
  onUnlockWorktree?: (path: string) => void;
  onPruneWorktrees?: () => void;
  onOpenWorktree?: (path: string) => void;
}

const pathBasename = (p: string) => (p.split(/[/\\]/).pop() || p);

export function WorktreesPanel({
  worktrees,
  currentBranch,
  onCreateWorktree,
  onRemoveWorktree,
  onLockWorktree,
  onUnlockWorktree,
  onPruneWorktrees,
  onOpenWorktree,
}: WorktreesPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [filter, setFilter] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [lockDialog, setLockDialog] = useState<string | null>(null);
  const [lockReason, setLockReason] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; wt: Worktree } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = (e: React.MouseEvent, wt: Worktree) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, wt });
  };

  const handleCloseContextMenu = useCallback(() => setContextMenu(null), []);

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

  const prunableCount = worktrees.filter(w => w.prunable).length;

  const confirmLock = () => {
    if (lockDialog) {
      onLockWorktree?.(lockDialog, lockReason.trim() || undefined);
      setLockReason('');
      setLockDialog(null);
    }
  };

  const getContextMenuActions = (wt: Worktree) => {
    const actions: { label: string; icon?: React.ReactNode; danger?: boolean; onClick: () => void }[] = [];
    if (wt.prunable) {
      actions.push({ label: 'Prune stale worktrees', icon: <Eraser className="size-3.5" />, onClick: () => onPruneWorktrees?.() });
      return actions;
    }
    actions.push({
      label: 'Open worktree',
      icon: <FolderOpen className="size-3.5" />,
      onClick: () => onOpenWorktree?.(wt.path),
    });
    actions.push({
      label: 'Create worktree here',
      icon: <Plus className="size-3.5" />,
      onClick: () => setShowCreateDialog(true),
    });
    if (!wt.current) {
      if (wt.locked !== undefined) {
        actions.push({ label: 'Unlock', icon: <Unlock className="size-3.5" />, onClick: () => onUnlockWorktree?.(wt.path) });
      } else {
        actions.push({ label: 'Lock...', icon: <Lock className="size-3.5" />, onClick: () => { setLockReason(''); setLockDialog(wt.path); } });
      }
    }
    actions.push({
      label: wt.locked !== undefined ? 'Remove (unlock first)' : 'Remove',
      icon: <Trash2 className="size-3.5" />,
      danger: true,
      onClick: () => onRemoveWorktree?.(wt.path, false),
    });
    return actions;
  };

  return (
    <>
      <div
        className="border-b border-border p-3 flex items-center gap-2 text-foreground cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
        <FolderTree className="size-4" />
        <h3 className="font-semibold text-sm">Worktrees</h3>
        {worktrees.length > 1 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary/50 group-hover:bg-secondary">{worktrees.length}</span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          {prunableCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPruneWorktrees?.();
              }}
              title="Prune stale worktrees"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors text-amber-400 hover:bg-amber-600/20"
            >
              <Eraser className="size-3" />
              Prune
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowCreateDialog(true);
            }}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors bg-secondary text-foreground hover:bg-muted"
          >
            <Plus className="size-3" />
            New
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="flex flex-col">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter worktrees..."
                className="h-7 pl-7 text-xs bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-zinc-700"
              />
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {worktrees.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No worktrees</div>
            ) : (
              <div className="divide-y divide-border">
                {worktrees
                  .filter(wt => {
                    const f = filter.toLowerCase();
                    return !f || wt.path.toLowerCase().includes(f) || (wt.branch || '').toLowerCase().includes(f);
                  })
                  .map((wt) => (
                    <div
                      key={wt.path}
                      className={`group flex items-center justify-between p-2.5 transition-colors hover:bg-accent/50 ${wt.current ? 'border-l-2 border-l-info' : ''}`}
                      title={wt.prunable ? `Stale: ${wt.prunable}` : wt.path}
                      onContextMenu={(e) => handleContextMenu(e, wt)}
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-2.5">
                        <FolderTree className="size-3.5 flex-shrink-0 mt-0.5 text-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`truncate text-sm ${wt.current ? 'text-info font-medium' : 'text-foreground'}`}>
                              {pathBasename(wt.path) || wt.path}
                            </span>
                            {wt.current && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-info/15 text-info flex-shrink-0">Current</span>
                            )}
                            {wt.main && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary/50 text-muted-foreground flex-shrink-0">Main</span>
                            )}
                            {wt.locked !== undefined && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-600/10 text-amber-400 flex-shrink-0" title={wt.locked || 'Locked'}>
                                {wt.locked ? `Locked: ${wt.locked}` : 'Locked'}
                              </span>
                            )}
                            {wt.prunable && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-red-400 flex-shrink-0">Stale</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            {wt.branch ? (
                              <>
                                <GitBranch className="size-2.5" />
                                <span className="font-medium text-foreground/80">{wt.branch}</span>
                              </>
                            ) : (
                              <span>{wt.bare ? 'bare' : 'detached HEAD'}</span>
                            )}
                            <span>•</span>
                            <span className="truncate max-w-[140px]" title={wt.path}>{wt.path}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {wt.prunable ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onPruneWorktrees?.();
                            }}
                            title="Prune stale worktrees"
                            className="p-1 rounded-md hover:bg-muted text-amber-400 hover:text-amber-300"
                          >
                            <Eraser className="size-3.5" />
                          </button>
                        ) : (
                          <>
                            {!wt.current && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenWorktree?.(wt.path);
                                }}
                                title="Open this worktree"
                                className="p-1 rounded-md hover:bg-muted text-foreground hover:text-muted-foreground"
                              >
                                <FolderOpen className="size-3.5" />
                              </button>
                            )}
                            {!wt.current && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveWorktree?.(wt.path, false);
                                }}
                                title="Remove worktree"
                                className="p-1 rounded-md hover:bg-muted text-red-400 hover:text-red-300"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-xl overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {getContextMenuActions(contextMenu.wt).map((action) => (
            <div
              key={action.label}
              className={`flex items-center gap-2 px-4 py-2 text-sm cursor-pointer transition-colors hover:bg-muted ${action.danger ? 'text-red-400 hover:text-red-300' : 'text-foreground'}`}
              onClick={() => {
                action.onClick();
                handleCloseContextMenu();
              }}
            >
              {action.icon}
              {action.label}
            </div>
          ))}
        </div>
      )}

      {/* Lock reason dialog */}
      <Dialog open={!!lockDialog} onOpenChange={(open) => { if (!open) { setLockDialog(null); setLockReason(''); } }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Lock className="size-5" />
              Lock Worktree
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Locking prevents Gitzen and other tools from modifying or pruning this worktree.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-foreground">Reason (optional)</Label>
              <Input
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                placeholder="e.g. CI builds running here"
                className="bg-secondary border-border text-foreground"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    confirmLock();
                  }
                }}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => { setLockDialog(null); setLockReason(''); }}
                className="bg-secondary border-border text-foreground hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmLock}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Lock className="size-4 mr-2" />
                Lock
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CreateWorktreeDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreateWorktree={async (options) => {
          if (!onCreateWorktree) return false;
          return await onCreateWorktree(options);
        }}
        worktrees={worktrees}
        currentBranch={currentBranch}
      />
    </>
  );
}