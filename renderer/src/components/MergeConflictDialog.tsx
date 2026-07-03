import { useState, useEffect } from 'react';
import { AlertTriangle, FileText, CheckCircle2, Trash2, Save, AlertCircle, Wand2, Loader2, Sparkles } from 'lucide-react';
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

interface AIProposal {
  explanation: string;
  resolvedCode: string;
}

interface MergeConflictDialogProps {
  open: boolean;
  conflictedFiles: ConflictedFile[];
  onOpenFile: (filePath: string) => void;
  onAbortConflict: () => void;
  onResolveFiles: (filePaths: string[]) => Promise<void>;
  onResolveConflict: (filePath: string, decision: 'keep' | 'delete') => Promise<void>;
  onResolveWithAI: (filePath: string) => Promise<{ explanation: string; resolvedCode: string } | null>;
  onApplyAIResolution: (filePath: string, resolvedCode: string) => Promise<void>;
  onClose: () => void;
}

export function MergeConflictDialog({ 
  open, 
  conflictedFiles, 
  onOpenFile, 
  onAbortConflict,
  onResolveFiles,
  onResolveConflict,
  onResolveWithAI,
  onApplyAIResolution,
  onClose 
}: MergeConflictDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState(false);
  const [aiProposals, setAiProposals] = useState<Record<string, AIProposal>>({});
  const [loadingAI, setLoadingAI] = useState<Record<string, boolean>>({});

  // Reset selected files when conflictedFiles changes
  useEffect(() => {
    setSelectedFiles(new Set());
    setAiProposals({});
    setLoadingAI({});
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

  const handleFetchAIResolution = async (filePath: string) => {
    setLoadingAI(prev => ({ ...prev, [filePath]: true }));
    try {
      const proposal = await onResolveWithAI(filePath);
      if (proposal) {
        setAiProposals(prev => ({ ...prev, [filePath]: proposal }));
      }
    } finally {
      setLoadingAI(prev => ({ ...prev, [filePath]: false }));
    }
  };

  const handleAcceptAIResolution = async (filePath: string) => {
    const proposal = aiProposals[filePath];
    if (!proposal) return;

    setResolving(true);
    try {
      await onApplyAIResolution(filePath, proposal.resolvedCode);
      // Remove from proposals after applying
      setAiProposals(prev => {
        const next = { ...prev };
        delete next[filePath];
        return next;
      });
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
      <DialogContent className="bg-card border-border max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            <DialogTitle>Merge Conflict Detected</DialogTitle>
          </div>
          <DialogDescription>
            The merge has conflicts that need to be resolved.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden flex flex-col space-y-4 py-4 min-h-0">
          {bulkResolvableFiles.length > 0 && (
            <div className="flex-shrink-0 flex items-center justify-between bg-background p-2 rounded border border-border">
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
          
          <div className="flex-1 bg-background border border-border rounded-lg overflow-y-auto">
            {conflictedFiles.length > 0 ? (
              <div className="divide-y divide-border">
                {conflictedFiles.map((file, index) => {
                  const isSelected = selectedFiles.has(file.path);
                  const isDeletedConflict = file.type === 'deleted-by-us' || file.type === 'deleted-by-them';
                  const hasProposal = !!aiProposals[file.path];
                  const isLoadingAI = !!loadingAI[file.path];
                  
                  return (
                    <div
                      key={index}
                      className={`flex flex-col gap-2 p-3 transition-colors ${
                        isSelected ? 'bg-secondary' : 'hover:bg-card/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
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
                            <>
                              {!hasProposal ? (
                                <Button
                                  onClick={() => handleFetchAIResolution(file.path)}
                                  disabled={resolving || isLoadingAI}
                                  className="bg-secondary hover:bg-muted text-foreground border border-border h-8 text-xs"
                                  size="sm"
                                >
                                  {isLoadingAI ? <Loader2 className="size-3 mr-1.5 animate-spin" /> : <Wand2 className="size-3 mr-1.5" />}
                                  Auto Resolve (AI)
                                </Button>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Button
                                    onClick={() => handleAcceptAIResolution(file.path)}
                                    disabled={resolving}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
                                    size="sm"
                                  >
                                    <CheckCircle2 className="size-3 mr-1.5" />
                                    Accept AI Solution
                                  </Button>
                                  <Button
                                    onClick={() => setAiProposals(prev => {
                                      const next = { ...prev };
                                      delete next[file.path];
                                      return next;
                                    })}
                                    variant="ghost"
                                    className="h-8 text-xs px-2 text-muted-foreground hover:text-foreground"
                                    size="sm"
                                  >
                                    Discard
                                  </Button>
                                </div>
                              )}
                              <Button
                                onClick={() => onOpenFile(file.path)}
                                className="bg-secondary hover:bg-muted text-foreground border border-border h-8 text-xs"
                                size="sm"
                              >
                                Open Merge Tool
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {hasProposal && (
                        <div className="mt-1 ml-7 flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                          <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-md text-xs">
                            <div className="flex items-center gap-1.5 mb-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                              <Sparkles className="size-3" />
                              AI Explanation
                            </div>
                            <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                              {aiProposals[file.path].explanation}
                            </p>
                          </div>
                          
                          <div className="border border-border rounded-md overflow-hidden bg-zinc-950">
                            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-border">
                              <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Proposed Resolution</span>
                              <FileText className="size-3 text-zinc-500" />
                            </div>
                            <div className="p-3 max-h-[200px] overflow-y-auto">
                              <pre className="text-[11px] font-mono text-zinc-300 leading-relaxed">
                                <code>{aiProposals[file.path].resolvedCode}</code>
                              </pre>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                <CheckCircle2 className="size-12 mx-auto mb-4 text-emerald-500" />
                <p className="font-semibold text-foreground text-lg">All conflicts resolved!</p>
                <p className="text-sm mt-1">You can now complete the merge operation.</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between flex-shrink-0 pt-2">
          <Button
            onClick={onAbortConflict}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            variant="destructive"
            disabled={resolving}
          >
            Abort Operation
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

