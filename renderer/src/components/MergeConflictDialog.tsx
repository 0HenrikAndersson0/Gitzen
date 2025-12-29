import { AlertTriangle, X, FileText } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface MergeConflictDialogProps {
  open: boolean;
  conflictedFiles: string[];
  onOpenFile: (filePath: string) => void;
  onAbortMerge: () => void;
  onClose: () => void;
}

export function MergeConflictDialog({ 
  open, 
  conflictedFiles, 
  onOpenFile, 
  onAbortMerge,
  onClose 
}: MergeConflictDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-red-400" />
            <DialogTitle>Merge Conflict Detected</DialogTitle>
          </div>
          <DialogDescription>
            The merge has conflicts that need to be resolved. Please resolve the conflicts in the following files:
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-h-[400px] overflow-y-auto">
            {conflictedFiles.length > 0 ? (
              <div className="divide-y divide-zinc-800">
                {conflictedFiles.map((filePath, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 hover:bg-zinc-900 transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileText className="size-4 text-zinc-400 flex-shrink-0" />
                      <span className="text-sm text-zinc-200 truncate" title={filePath}>
                        {filePath}
                      </span>
                    </div>
                    <Button
                      onClick={() => onOpenFile(filePath)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 h-auto text-sm flex-shrink-0"
                    >
                      Open File
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-zinc-400">
                No conflicted files found
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            onClick={onAbortMerge}
            className="bg-red-600 hover:bg-red-700 text-white"
            variant="destructive"
          >
            Abort Merge
          </Button>
          <Button
            onClick={onClose}
            className="bg-zinc-700 hover:bg-zinc-600"
            variant="outline"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

