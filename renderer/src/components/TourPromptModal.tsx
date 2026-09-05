import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

interface TourPromptModalProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function TourPromptModal({ open, onAccept, onDecline }: TourPromptModalProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onDecline()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Welcome to Gitzen!</DialogTitle>
          <DialogDescription>
            Would you like to take a quick interactive tour to learn about Gitzen's features? We'll open a demo repository for you to explore safely.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <button
            onClick={onDecline}
            className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm font-medium"
          >
            Skip Tour
          </button>
          <button
            onClick={onAccept}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            Start Tour
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
