import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';

interface RebaseTodoItem {
  action: 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop';
  hash: string;
  message: string;
}

interface RebaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetBranch: string;
  currentBranch: string;
  onStartRebase: (targetBranch: string, todoLines: string[]) => Promise<void>;
}

export function RebaseModal({ isOpen, onClose, targetBranch, currentBranch, onStartRebase }: RebaseModalProps) {
  const [commits, setCommits] = useState<RebaseTodoItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && targetBranch) {
      loadCommits();
    }
  }, [isOpen, targetBranch]);

  const loadCommits = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.gitGetCommitsForInteractiveRebase(targetBranch);
      if (result.success && result.commits) {
        setCommits(result.commits);
      } else {
        toast.error(result.error || 'Failed to load commits for rebase');
        onClose();
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to load commits');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const moveCommit = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === commits.length - 1)) {
      return;
    }

    const newCommits = [...commits];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const temp = newCommits[index];
    newCommits[index] = newCommits[targetIndex];
    newCommits[targetIndex] = temp;

    // Ensure the first commit doesn't have squash or fixup action
    if (newCommits[0].action === 'squash' || newCommits[0].action === 'fixup') {
      newCommits[0].action = 'pick';
    }

    setCommits(newCommits);
  };

  const updateAction = (index: number, action: RebaseTodoItem['action']) => {
    const newCommits = [...commits];
    newCommits[index].action = action;
    setCommits(newCommits);
  };

  const updateMessage = (index: number, message: string) => {
    const newCommits = [...commits];
    newCommits[index].message = message;
    setCommits(newCommits);
  };

  const handleStart = async () => {
    // Construct todo lines
    const todoLines: string[] = [];

    for (const c of commits) {
      if (c.action === 'reword') {
        // Use pick + exec for reword to avoid interactive editor
        // We use single quotes for the message to avoid shell expansion (e.g. $VAR)
        // and escape any existing single quotes by closing the quote, adding an escaped quote, and reopening
        const escapedMessage = c.message.replace(/'/g, "'\\''");
        todoLines.push(`pick ${c.hash} ${c.message}`); // The message here doesn't matter for pick
        todoLines.push(`exec git commit --amend -m '${escapedMessage}'`);
      } else if (c.action === 'squash') {
        // For squash, we use fixup to silently merge the code, then explicitly rewrite the combined commit message
        // to whatever the user typed in the input field, avoiding Git's messy default concatenated squash messages.
        const escapedMessage = c.message.replace(/'/g, "'\\''");
        todoLines.push(`fixup ${c.hash} ${c.message}`);
        todoLines.push(`exec git commit --amend -m '${escapedMessage}'`);
      } else {
        todoLines.push(`${c.action} ${c.hash} ${c.message}`);
      }
    }

    await onStartRebase(targetBranch, todoLines);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-border max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Interactive Rebase</DialogTitle>
          <DialogDescription>
            Rebasing <span className="font-mono text-foreground">{currentBranch}</span> onto <span className="font-mono text-foreground">{targetBranch}</span>.
            Drag and drop or use arrows to reorder. Change actions to squash, fixup, etc.
          </DialogDescription>
          <div className="text-xs text-amber-500/80 bg-amber-500/10 p-2 rounded border border-amber-500/20 mt-2">
            Note: The first commit in the list represents the base of your rebase and cannot be squashed or fixed up.
            To squash commits, they must come after a 'pick' or 'reword' commit.
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-[300px] mt-4 space-y-2">
          {loading ? (
            <div className="text-center text-muted-foreground py-8">Loading commits...</div>
          ) : commits.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No commits to rebase.</div>
          ) : (
            commits.map((commit, index) => (
              <div key={commit.hash} className="flex items-center gap-2 p-2 bg-secondary/50 rounded-md border border-border/50">
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveCommit(index, 'up')}
                    disabled={index === 0}
                    className="p-1 hover:bg-muted rounded disabled:opacity-30"
                  >
                    <ArrowUp className="size-3 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => moveCommit(index, 'down')}
                    disabled={index === commits.length - 1}
                    className="p-1 hover:bg-muted rounded disabled:opacity-30"
                  >
                    <ArrowDown className="size-3 text-muted-foreground" />
                  </button>
                </div>

                <Select value={commit.action} onValueChange={(val) => updateAction(index, val as any)}>
                  <SelectTrigger className="w-[100px] h-8 bg-secondary border-border text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border-border">
                    <SelectItem value="pick">Pick</SelectItem>
                    <SelectItem value="reword">Reword</SelectItem>
                    <SelectItem value="edit">Edit</SelectItem>
                    <SelectItem value="squash" disabled={index === 0}>Squash</SelectItem>
                    <SelectItem value="fixup" disabled={index === 0}>Fixup</SelectItem>
                    <SelectItem value="drop">Drop</SelectItem>
                  </SelectContent>
                </Select>

                <div className="font-mono text-xs text-muted-foreground w-[70px]">{commit.hash.substring(0, 7)}</div>

                <Input
                  value={commit.message}
                  onChange={(e) => updateMessage(index, e.target.value)}
                  disabled={commit.action !== 'reword' && commit.action !== 'squash'}
                  className={`h-8 text-sm transition-colors ${
                    (commit.action === 'reword' || commit.action === 'squash')
                      ? 'bg-card border-blue-500 ring-1 ring-blue-500/20' 
                      : 'bg-transparent border-transparent hover:border-border disabled:opacity-70'
                  } ${commit.action === 'drop' ? 'line-through text-muted-foreground' : ''}`}
                  placeholder={commit.action === 'reword' || commit.action === 'squash' ? "Enter new commit message..." : ""}
                />
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose} className="bg-secondary border-border text-foreground">Cancel</Button>
          <Button onClick={handleStart} className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={loading || commits.length === 0}>
            Start Rebase
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
