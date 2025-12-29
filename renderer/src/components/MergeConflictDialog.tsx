import { useState, useEffect } from 'react';
import { AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
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
  onResolveFiles: (filePaths: string[]) => Promise<void>;
  onClose: () => void;
}

export function MergeConflictDialog({ 
  open, 
  conflictedFiles, 
  onOpenFile, 
  onAbortMerge,
  onResolveFiles,
  onClose 
}: MergeConflictDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState(false);

  // Reset selected files when conflictedFiles changes
  useEffect(() => {
    setSelectedFiles(new Set());
  }, [conflictedFiles]);

  // Close dialog when all files are resolved
  useEffect(() => {
    if (conflictedFiles.length === 0 && open) {
      onClose();
    }
  }, [conflictedFiles.length, open, onClose]);

  const handleToggleFile = (filePath: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(filePath)) {
        newSet.delete(filePath);
      } else {
        newSet.add(filePath);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedFiles.size === conflictedFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(conflictedFiles));
    }
  };

  const handleResolveSelected = async () => {
    if (selectedFiles.size === 0) return;

    setResolving(true);
    try {
      await onResolveFiles(Array.from(selectedFiles));
      setSelectedFiles(new Set());
    } catch (error) {
      console.error('Failed to resolve files:', error);
    } finally {
      setResolving(false);
    }
  };

  const allSelected = conflictedFiles.length > 0 && selectedFiles.size === conflictedFiles.length;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-red-400" />
            <DialogTitle>Merge Conflict Detected</DialogTitle>
          </div>
          <DialogDescription>
            The merge has conflicts that need to be resolved. Select resolved files and click "Mark as Resolved" to remove them from the list.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {conflictedFiles.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                />
                <span className="text-sm text-zinc-400">
                  {selectedFiles.size > 0 
                    ? `${selectedFiles.size} of ${conflictedFiles.length} selected`
                    : `Select files to mark as resolved (${conflictedFiles.length} remaining)`
                  }
                </span>
              </div>
              {selectedFiles.size > 0 && (
                <Button
                  onClick={handleResolveSelected}
                  disabled={resolving}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  size="sm"
                >
                  <CheckCircle2 className="size-4 mr-2" />
                  {resolving ? 'Resolving...' : `Mark ${selectedFiles.size} as Resolved`}
                </Button>
              )}
            </div>
          )}
          
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-h-[400px] overflow-y-auto">
            {conflictedFiles.length > 0 ? (
              <div className="divide-y divide-zinc-800">
                {conflictedFiles.map((filePath, index) => {
                  const isSelected = selectedFiles.has(filePath);
                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-3 p-3 transition-colors ${
                        isSelected ? 'bg-blue-600/10' : 'hover:bg-zinc-900'
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggleFile(filePath)}
                        className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                      />
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="size-4 text-zinc-400 flex-shrink-0" />
                        <span className="text-sm text-zinc-200 truncate" title={filePath}>
                          {filePath}
                        </span>
                      </div>
                      <Button
                        onClick={() => onOpenFile(filePath)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 h-auto text-sm flex-shrink-0"
                        size="sm"
                      >
                        Open File
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 text-center text-zinc-400">
                <CheckCircle2 className="size-8 mx-auto mb-2 text-green-400" />
                <p className="font-medium">All conflicts resolved!</p>
                <p className="text-xs mt-1">You can now complete the merge.</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            onClick={onAbortMerge}
            className="bg-red-600 hover:bg-red-700 text-white"
            variant="destructive"
            disabled={resolving}
          >
            Abort Merge
          </Button>
          <Button
            onClick={onClose}
            className="bg-zinc-700 hover:bg-zinc-600"
            variant="outline"
            disabled={resolving}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

