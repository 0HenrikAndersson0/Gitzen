import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';

interface CreateTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTagCreated: () => void;
  commitHash?: string; // Optional: if provided, creates tag at this commit
}

export function CreateTagDialog({ open, onOpenChange, onTagCreated, commitHash }: CreateTagDialogProps) {
  const [newTagName, setNewTagName] = useState('');

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) {
      toast.error('Tag name cannot be empty');
      return;
    }

    if (!/^[a-zA-Z0-9/._-]+$/.test(name)) {
        toast.error('Tag name contains invalid characters');
        return;
    }

    try {
      const result = await window.electronAPI.createTag(name, commitHash);
      if (result.success) {
        toast.success(`Created tag ${name}${commitHash ? ` at ${commitHash.substring(0, 7)}` : ''}`);
        onOpenChange(false);
        setNewTagName('');
        onTagCreated();
      } else {
        toast.error(result.error || 'Failed to create tag');
      }
    } catch (error) {
      toast.error('Failed to create tag');
      console.error('Create tag error:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Create New Tag</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Enter a name for the new tag. {commitHash ? `It will be created at commit ${commitHash.substring(0, 7)}.` : 'It will be created at the current HEAD.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="v1.0.0"
            className="bg-zinc-800 border-zinc-700 text-zinc-100"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateTag();
              }
            }}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                setNewTagName('');
              }}
              className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTag}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!newTagName.trim()}
            >
              Create Tag
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
