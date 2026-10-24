import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { FolderOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export type WorktreeMode = 'new' | 'existing' | 'detach';

interface CreateWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateWorktree: (options: { path: string; branch?: string; newBranch?: string; startPoint?: string; detach?: boolean }) => Promise<boolean>;
  worktrees: Worktree[];
  currentBranch: string;
}

const BRANCH_NAME_REGEX = /^[a-zA-Z0-9/_.-]+$/;

export function CreateWorktreeDialog({ open, onOpenChange, onCreateWorktree, worktrees, currentBranch }: CreateWorktreeDialogProps) {
  const [wtPath, setWtPath] = useState('');
  const [mode, setMode] = useState<WorktreeMode>('new');
  const [newBranchName, setNewBranchName] = useState('');
  const [existingBranch, setExistingBranch] = useState('');
  const [localBranches, setLocalBranches] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const branchesInUse = new Set(worktrees.map(w => w.branch).filter(Boolean) as string[]);
  const availableBranches = localBranches.filter(b => !branchesInUse.has(b) && b !== currentBranch);

  const loadBranches = useCallback(async () => {
    try {
      const result = await window.electronAPI.gitGetBranches();
      if (result.success && result.branches) {
        setLocalBranches(result.branches);
      }
    } catch (error) {
      console.error('Failed to load branches for worktree creation:', error);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadBranches();
      setMode('new');
      setNewBranchName('');
      setExistingBranch('');
      setWtPath('');
      setSubmitting(false);
    }
  }, [open, loadBranches]);

  const handleBrowse = async () => {
    try {
      const result = await window.electronAPI.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Worktree Destination Folder',
      });
      if (result.success && result.path) {
        setWtPath(result.path);
      }
    } catch (error) {
      console.error('Failed to open directory dialog:', error);
    }
  };

  const handleCreate = async () => {
    const path = wtPath.trim();
    if (!path) {
      toast.error('Please choose a destination folder for the worktree');
      return;
    }

    if (mode === 'new') {
      const name = newBranchName.trim();
      if (!name) {
        toast.error('Branch name cannot be empty');
        return;
      }
      if (!BRANCH_NAME_REGEX.test(name)) {
        toast.error('Branch name contains invalid characters');
        return;
      }
    }

    if (mode === 'existing' && !existingBranch) {
      toast.error('Please select an existing branch');
      return;
    }

    setSubmitting(true);
    try {
      const success = await onCreateWorktree({
        path,
        ...(mode === 'new' && { newBranch: newBranchName.trim(), startPoint: 'HEAD' }),
        ...(mode === 'existing' && { branch: existingBranch }),
        ...(mode === 'detach' && { detach: true }),
      });
      if (success) {
        onOpenChange(false);
        setWtPath('');
        setNewBranchName('');
        setExistingBranch('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">Create New Worktree</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            A worktree is a separate working directory linked to this repository, letting you work on multiple branches simultaneously.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-foreground">Destination folder</Label>
            <div className="flex gap-2">
              <Input
                value={wtPath}
                onChange={(e) => setWtPath(e.target.value)}
                placeholder="/path/to/worktree"
                className="bg-secondary border-border text-foreground"
                autoFocus
              />
              <Button
                variant="outline"
                onClick={handleBrowse}
                className="bg-secondary border-border text-foreground hover:bg-muted shrink-0"
                title="Browse for folder"
              >
                <FolderOpen className="size-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-foreground">Branch setup</Label>
            <Select value={mode} onValueChange={(value) => setMode(value as WorktreeMode)}>
              <SelectTrigger className="w-full bg-secondary border-border text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="new" className="text-foreground">Create a new branch from HEAD</SelectItem>
                <SelectItem value="existing" className="text-foreground">Check out an existing branch</SelectItem>
                <SelectItem value="detach" className="text-foreground">Detached HEAD (no branch)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === 'new' && (
            <div className="space-y-1.5">
              <Label className="text-foreground">New branch name</Label>
              <Input
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="feature/my-feature"
                className="bg-secondary border-border text-foreground"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !submitting) {
                    handleCreate();
                  }
                }}
              />
            </div>
          )}

          {mode === 'existing' && (
            <div className="space-y-1.5">
              <Label className="text-foreground">Existing branch</Label>
              {availableBranches.length > 0 ? (
                <Select value={existingBranch || undefined} onValueChange={setExistingBranch}>
                  <SelectTrigger className="w-full bg-secondary border-border text-foreground">
                    <SelectValue placeholder="Select a branch" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border max-h-60">
                    {availableBranches.map((branch) => (
                      <SelectItem key={branch} value={branch} className="text-foreground">{branch}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">
                  All branches are already checked out in a worktree. Create a new branch instead.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="bg-secondary border-border text-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {submitting ? 'Creating...' : 'Create Worktree'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}