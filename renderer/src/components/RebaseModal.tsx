import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { GitCommit, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
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
        // We need to escape quotes in the message for the shell command
        const escapedMessage = c.message.replace(/"/g, '\\"');
        todoLines.push(`pick ${c.hash} ${c.message}`); // The message here doesn't matter for pick
        todoLines.push(`exec git commit --amend -m "${escapedMessage}"`);
      } else {
        todoLines.push(`${c.action} ${c.hash} ${c.message}`);
      }
    }

    await onStartRebase(targetBranch, todoLines);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Interactive Rebase</DialogTitle>
          <DialogDescription>
            Rebasing <span className="font-mono text-blue-400">{currentBranch}</span> onto <span className="font-mono text-purple-400">{targetBranch}</span>.
            Drag and drop or use arrows to reorder. Change actions to squash, fixup, etc.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-[300px] mt-4 space-y-2">
          {loading ? (
            <div className="text-center text-zinc-500 py-8">Loading commits...</div>
          ) : commits.length === 0 ? (
            <div className="text-center text-zinc-500 py-8">No commits to rebase.</div>
          ) : (
            commits.map((commit, index) => (
              <div key={commit.hash} className="flex items-center gap-2 p-2 bg-zinc-800/50 rounded-md border border-zinc-700/50">
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveCommit(index, 'up')}
                    disabled={index === 0}
                    className="p-1 hover:bg-zinc-700 rounded disabled:opacity-30"
                  >
                    <ArrowUp className="size-3 text-zinc-400" />
                  </button>
                  <button
                    onClick={() => moveCommit(index, 'down')}
                    disabled={index === commits.length - 1}
                    className="p-1 hover:bg-zinc-700 rounded disabled:opacity-30"
                  >
                    <ArrowDown className="size-3 text-zinc-400" />
                  </button>
                </div>

                <Select value={commit.action} onValueChange={(val) => updateAction(index, val as any)}>
                  <SelectTrigger className="w-[100px] h-8 bg-zinc-800 border-zinc-700 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="pick">Pick</SelectItem>
                    <SelectItem value="reword">Reword</SelectItem>
                    <SelectItem value="edit">Edit</SelectItem>
                    <SelectItem value="squash">Squash</SelectItem>
                    <SelectItem value="fixup">Fixup</SelectItem>
                    <SelectItem value="drop">Drop</SelectItem>
                  </SelectContent>
                </Select>

                <div className="font-mono text-xs text-zinc-500 w-[70px]">{commit.hash.substring(0, 7)}</div>

                <Input
                  value={commit.message}
                  onChange={(e) => updateMessage(index, e.target.value)}
                  disabled={commit.action !== 'reword'}
                  className={`h-8 bg-transparent border-transparent hover:border-zinc-700 focus:border-zinc-600 text-sm ${commit.action === 'drop' ? 'line-through text-zinc-500' : ''}`}
                />
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800">
          <Button variant="outline" onClick={onClose} className="bg-zinc-800 border-zinc-700 text-zinc-300">Cancel</Button>
          <Button onClick={handleStart} className="bg-blue-600 hover:bg-blue-700 text-white" disabled={loading || commits.length === 0}>
            Start Rebase
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
