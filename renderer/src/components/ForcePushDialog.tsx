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
      <DialogContent className="sm:max-w-[450px] bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-500">
            <AlertTriangle className="size-5" />
            Force Push Required
          </DialogTitle>
          <DialogDescription className="pt-2 text-muted-foreground">
            The remote branch <span className="text-foreground font-mono">{targetBranch}</span> has commits that you do not have locally.
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
          <Label htmlFor="overwrite" className="text-sm font-normal cursor-pointer text-foreground">
            Use <code className="text-red-400">--force</code> instead of <code className="text-foreground">--force-with-lease</code>
          </Label>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="border-border hover:bg-accent text-foreground">
            Cancel
          </Button>
          <Button 
            onClick={() => {
              onConfirm(overwrite);
              onClose();
            }} 
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            Force Push
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
