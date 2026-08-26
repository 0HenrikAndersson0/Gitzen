import { useState, useEffect } from 'react';
import { X, Send, GitCommit, FileText, Loader2 } from 'lucide-react';
import { DiffViewer } from './DiffViewer/DiffViewer';
import { FileChangeDiff, parseDiff } from '../lib/diffUtils';
import { FileChange } from '../hooks/useGitState';
import { DraftFeedback } from './AgentSessionView';

interface AgentReviewModalProps {
  files: FileChange[];
  onClose: () => void;
  onSubmitFeedback: (feedbacks: DraftFeedback[]) => void;
}

export function AgentReviewModal({ files, onClose, onSubmitFeedback }: AgentReviewModalProps) {
  const [diffs, setDiffs] = useState<Record<string, FileChangeDiff | null>>({});
  const [loading, setLoading] = useState(true);
  const [draftFeedbacks, setDraftFeedbacks] = useState<DraftFeedback[]>([]);
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('unified');

  useEffect(() => {
    async function loadDiffs() {
      setLoading(true);
      const newDiffs: Record<string, FileChangeDiff | null> = {};
      
      try {
        await Promise.all(
          files.map(async (file) => {
            const result = await window.electronAPI.getFileDiff(file.path, file.staged);
            if (result.success && result.diff) {
              newDiffs[file.path] = parseDiff(result.diff);
            } else {
              newDiffs[file.path] = null;
            }
          })
        );
      } catch (err) {
        console.error('Failed to load some diffs:', err);
      } finally {
        setDiffs(newDiffs);
        setLoading(false);
      }
    }
    
    loadDiffs();
  }, [files]);

  const handleAddDraftComment = (filePath: string, comment: any) => {
    const fileDiff = diffs[filePath];
    if (!fileDiff) return;

    const lineContent = fileDiff.hunks[comment.hunkIndex]?.lines[comment.lineIndex]?.content || '';
    
    const newFeedback: DraftFeedback = {
        id: Math.random().toString(36).substring(7),
        filePath,
        hunkIndex: comment.hunkIndex,
        lineIndex: comment.lineIndex,
        lineContent,
        text: comment.text
    };
    
    setDraftFeedbacks(prev => [...prev, newFeedback]);
  };

  const handleRemoveDraftComment = (filePath: string, hunkIdx: number, lineIdx: number, idx: number) => {
    setDraftFeedbacks(prev => {
        const fileFeedbacks = prev.filter(d => d.filePath === filePath && d.hunkIndex === hunkIdx && d.lineIndex === lineIdx);
        const feedbackToRemove = fileFeedbacks[idx];
        if (feedbackToRemove) {
            return prev.filter(d => d.id !== feedbackToRemove.id);
        }
        return prev;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-background/80 backdrop-blur-sm">
      <div className="flex-1 flex flex-col bg-background m-4 md:m-8 lg:m-12 border border-border shadow-2xl rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-md">
              <GitCommit className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Code Review</h2>
              <div className="text-xs text-muted-foreground">
                Reviewing {files.length} changed file{files.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex bg-muted rounded-md p-0.5 border border-border/50">
              <button
                className={`px-3 py-1 text-xs rounded-sm transition-colors ${viewMode === 'unified' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setViewMode('unified')}
              >
                Unified
              </button>
              <button
                className={`px-3 py-1 text-xs rounded-sm transition-colors ${viewMode === 'split' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setViewMode('split')}
              >
                Split
              </button>
            </div>
            
            <button
              onClick={() => {
                onSubmitFeedback(draftFeedbacks);
                onClose();
              }}
              disabled={draftFeedbacks.length === 0}
              className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <Send className="w-4 h-4" />
              Send {draftFeedbacks.length > 0 ? draftFeedbacks.length : ''} Feedback
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-muted/10 p-6">
          <div className="max-w-6xl mx-auto flex flex-col gap-8 pb-12">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p>Loading diffs for {files.length} files...</p>
              </div>
            ) : files.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <p>No changed files to review.</p>
              </div>
            ) : (
              files.map(file => {
                const diff = diffs[file.path];
                const fileFeedbacks = draftFeedbacks.filter(d => d.filePath === file.path);
                
                return (
                  <div key={file.path} className="border border-border rounded-md overflow-hidden bg-background shadow-sm">
                    <div className="px-4 py-2 border-b border-border bg-muted/40 flex items-center justify-between sticky top-0 z-20 backdrop-blur-sm">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{file.path}</span>
                        {fileFeedbacks.length > 0 && (
                          <span className="bg-primary/20 text-primary px-2 py-0.5 rounded-full ml-2 text-xs">
                            {fileFeedbacks.length} draft{fileFeedbacks.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="p-0">
                      {diff && diff.hunks && diff.hunks.length > 0 ? (
                        <DiffViewer
                          hunks={diff.hunks}
                          viewMode={viewMode}
                          readOnly={true} // Hide staging checkboxes, but keep comments
                          draftComments={fileFeedbacks}
                          onAddDraftComment={(comment) => handleAddDraftComment(file.path, comment)}
                          onRemoveDraftComment={(hunkIdx, lineIdx, idx) => handleRemoveDraftComment(file.path, hunkIdx, lineIdx, idx)}
                        />
                      ) : (
                        <div className="p-8 text-center text-muted-foreground text-sm">
                          No diff available for this file. It might be a binary file, a newly added empty file, or it may have been deleted.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
