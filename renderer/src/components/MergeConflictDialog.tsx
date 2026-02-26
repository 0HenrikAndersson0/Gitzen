import { useState, useEffect } from 'react';
import { AlertTriangle, FileText, CheckCircle2, Trash2, Save, AlertCircle } from 'lucide-react';
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
  conflictedFiles: ConflictedFile[];
  onOpenFile: (filePath: string) => void;
  onAbortMerge: () => void;
  onResolveFiles: (filePaths: string[]) => Promise<void>;
  onResolveConflict: (filePath: string, decision: 'keep' | 'delete') => Promise<void>;
  onClose: () => void;
}

export function MergeConflictDialog({ 
  open, 
  conflictedFiles, 
  onOpenFile, 
  onAbortMerge,
  onResolveFiles,
  onResolveConflict,
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
    // Only select files that are standard modified conflicts (can be bulk resolved via git add)
    // Complex conflicts (deleted/added/renamed) usually require specific decisions
    const bulkResolvableFiles = conflictedFiles.filter(f => 
      f.type === 'both-modified' || f.type === 'both-added' || f.type === 'both-deleted' || f.type === 'unknown'
    ).map(f => f.path);

    if (selectedFiles.size === bulkResolvableFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(bulkResolvableFiles));
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

  const handleSpecificResolution = async (file: ConflictedFile, decision: 'keep' | 'delete') => {
    setResolving(true);
    try {
      await onResolveConflict(file.path, decision);
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
    } finally {
      setResolving(false);
    }
  };

  const bulkResolvableFiles = conflictedFiles.filter(f => 
    f.type === 'both-modified' || f.type === 'both-added' || f.type === 'both-deleted' || f.type === 'unknown'
  );
  
  const allSelected = bulkResolvableFiles.length > 0 && selectedFiles.size === bulkResolvableFiles.length;

  const getConflictDescription = (type: ConflictedFile['type']) => {
    switch (type) {
      case 'both-modified': return 'Both modified';
      case 'deleted-by-us': return 'Deleted by us, modified by them';
      case 'deleted-by-them': return 'Modified by us, deleted by them';
      case 'both-added': return 'Both added';
      case 'both-deleted': return 'Both deleted';
      case 'added-by-us': return 'Added by us';
      case 'added-by-them': return 'Added by them';
      default: return 'Conflict';
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="bg-card border-border max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            <DialogTitle>Merge Conflict Detected</DialogTitle>
          </div>
          <DialogDescription>
            The merge has conflicts that need to be resolved.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {bulkResolvableFiles.length > 0 && (
            <div className="flex items-center justify-between bg-background p-2 rounded border border-border">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <span className="text-sm text-muted-foreground">
                  Select all standard conflicts
                </span>
              </div>
              <Button
                onClick={handleResolveSelected}
                disabled={resolving || selectedFiles.size === 0}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                size="sm"
              >
                <CheckCircle2 className="size-4 mr-2" />
                Mark Selected as Resolved
              </Button>
            </div>
          )}
          
          <div className="bg-background border border-border rounded-lg max-h-[500px] overflow-y-auto">
            {conflictedFiles.length > 0 ? (
              <div className="divide-y divide-border">
                {conflictedFiles.map((file, index) => {
                  const isSelected = selectedFiles.has(file.path);
                  const isDeletedConflict = file.type === 'deleted-by-us' || file.type === 'deleted-by-them';
                  
                  return (
                    <div
                      key={index}
                      className={`flex flex-col gap-2 p-3 transition-colors ${
                        isSelected ? 'bg-secondary' : 'hover:bg-card'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          {!isDeletedConflict && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleFile(file.path)}
                              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                            />
                          )}
                          <div className="flex flex-col min-w-0">
                             <div className="flex items-center gap-2">
                                <FileText className="size-4 text-muted-foreground flex-shrink-0" />
                                <span className="text-sm font-medium text-foreground truncate" title={file.path}>
                                  {file.path}
                                </span>
                             </div>
                             <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <AlertCircle className="size-3" />
                                {getConflictDescription(file.type)}
                             </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isDeletedConflict ? (
                            <>
                              <Button
                                onClick={() => handleSpecificResolution(file, 'keep')}
                                disabled={resolving}
                                className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-600/50 h-8 text-xs"
                                size="sm"
                              >
                                <Save className="size-3 mr-1.5" />
                                Keep File
                              </Button>
                              <Button
                                onClick={() => handleSpecificResolution(file, 'delete')}
                                disabled={resolving}
                                className="bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/50 h-8 text-xs"
                                size="sm"
                              >
                                <Trash2 className="size-3 mr-1.5" />
                                Delete File
                              </Button>
                            </>
                          ) : (
                            <Button
                              onClick={() => onOpenFile(file.path)}
                              className="bg-secondary hover:bg-muted text-foreground border border-border h-8 text-xs"
                              size="sm"
                            >
                              Open Merge Tool
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 text-center text-muted-foreground">
                <CheckCircle2 className="size-8 mx-auto mb-2 text-foreground" />
                <p className="font-medium">All conflicts resolved!</p>
                <p className="text-xs mt-1">You can now complete the merge.</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            onClick={onAbortMerge}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            variant="destructive"
            disabled={resolving}
          >
            Abort Merge
          </Button>
          <Button
            onClick={onClose}
            className="bg-muted hover:bg-accent"
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

