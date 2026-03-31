import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";

interface InitGitFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInitialize: () => void;
}

export function InitGitFlowDialog({ open, onOpenChange, onInitialize }: InitGitFlowDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Initialize Git Flow</DialogTitle>
          <DialogDescription>
            This repository has not been initialized with Git Flow. Git Flow is a branching model that enforces a strict structure 
            using prefixes like `feature/`, `bugfix/`, `release/`, and `hotfix/`.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Initializing will configure your local repository with the standard prefixes, allowing Gitzen to safely automate branching and merging logic. No destructive operations will occur.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="default" onClick={onInitialize}>
            Initialize with Defaults
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
