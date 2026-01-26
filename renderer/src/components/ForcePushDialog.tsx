import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { AlertTriangle } from 'lucide-react';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { useState } from 'react';

interface ForcePushDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (overwrite: boolean) => void;
  targetBranch: string;
}

export function ForcePushDialog({ open, onClose, onConfirm, targetBranch }: ForcePushDialogProps) {
  const [overwrite, setOverwrite] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[450px] bg-zinc-900 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-500">
            <AlertTriangle className="size-5" />
            Force Push Required
          </DialogTitle>
          <DialogDescription className="pt-2 text-zinc-400">
            The remote branch <span className="text-zinc-200 font-mono">{targetBranch}</span> has commits that you do not have locally.
            This usually happens after a rebase or if the remote history has been rewritten.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3 text-sm text-red-200">
          Force pushing will <strong>overwrite</strong> the remote branch with your local changes.
          Any commits on the remote that are not in your local branch will be lost forever.
        </div>

        <div className="flex items-center space-x-2 py-2">
          <Checkbox 
            id="overwrite" 
            checked={overwrite} 
            onCheckedChange={(checked) => setOverwrite(checked as boolean)}
          />
          <Label htmlFor="overwrite" className="text-sm font-normal cursor-pointer text-zinc-300">
            Use <code className="text-red-400">--force</code> instead of <code className="text-blue-400">--force-with-lease</code>
          </Label>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="border-zinc-700 hover:bg-zinc-800 text-zinc-300">
            Cancel
          </Button>
          <Button 
            onClick={() => {
              onConfirm(overwrite);
              onClose();
            }} 
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Force Push
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
