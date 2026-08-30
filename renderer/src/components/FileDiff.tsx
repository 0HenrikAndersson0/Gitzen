import { X, FileText, FilePlus, FileX, Check, Undo2, Trash2, ChevronLeft, ChevronRight, History } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { parseDiff, generatePatch, FileChangeDiff } from '../lib/diffUtils';
import { DiffViewer } from './DiffViewer/DiffViewer';
import { BlameViewer } from './BlameViewer';

export interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted';
  staged: boolean;
  diff?: FileChangeDiff;
}

interface FileDiffProps {
  file: FileChange;
  onClose: () => void;
  onRefresh?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
}

export function FileDiff({ file, onClose, onRefresh, onNext, onPrevious }: FileDiffProps) {
  const [diff, setDiff] = useState<FileChangeDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('unified');
  const [showBlame, setShowBlame] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && onNext) {
        onNext();
      } else if (e.key === 'ArrowLeft' && onPrevious) {
        onPrevious();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNext, onPrevious, onClose]);

  useEffect(() => {
    const loadDiff = async () => {
      setLoading(true);
      try {
        const result = await (window as any).electronAPI.getFileDiff(file.path, file.staged);
        if (result.success && result.diff) {
          const parsed = parseDiff(result.diff);
          setDiff(parsed);

          const allLines = new Set<string>();
          parsed.hunks.forEach((h, hIdx) => {
            h.lines.forEach((l, lIdx) => {
              if (l.type !== 'context') {
                allLines.add(`${hIdx}-${lIdx}`);
              }
            });
          });
          setSelectedLines(allLines);
        } else {
          setDiff(null);
          if (result.error) toast.error(result.error);
        }
      } catch (error) {
        console.error('Failed to load diff:', error);
        toast.error('Failed to load file diff');
      } finally {
        setLoading(false);
      }
    };

    loadDiff();
  }, [file.path, file.staged]);

  const toggleLine = (hunkIndex: number, lineIndex: number) => {
    const key = `${hunkIndex}-${lineIndex}`;
    const newSelected = new Set(selectedLines);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedLines(newSelected);
  };

  const toggleHunk = (hunkIndex: number) => {
    if (!diff) return;
    const hunk = diff.hunks[hunkIndex];
    const newSelected = new Set(selectedLines);

    let allSelected = true;
    let hasChanges = false;

    hunk.lines.forEach((line, lineIndex) => {
      if (line.type !== 'context') {
        hasChanges = true;
        if (!newSelected.has(`${hunkIndex}-${lineIndex}`)) {
          allSelected = false;
        }
      }
    });

    if (!hasChanges) return;

    hunk.lines.forEach((line, lineIndex) => {
      if (line.type !== 'context') {
        const key = `${hunkIndex}-${lineIndex}`;
        if (allSelected) {
          newSelected.delete(key);
        } else {
          newSelected.add(key);
        }
      }
    });

    setSelectedLines(newSelected);
  };

  const handleStageSelected = async () => {
    if (!diff || selectedLines.size === 0) return;
    setProcessing(true);
    try {
      const patch = generatePatch(file.path, diff.hunks, selectedLines);

      const result = await (window as any).electronAPI.applyPatch(patch, {
        cached: true,
        reverse: file.staged
      });

      if (result.success) {
        toast.success(file.staged ? 'Unstaged selected changes' : 'Staged selected changes');
        onRefresh?.();
        onClose();
      } else {
        toast.error(result.error || 'Failed to update changes');
      }
    } catch (error) {
      console.error('Failed to apply patch:', error);
      toast.error('An error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const handleDiscardSelected = async () => {
    if (!diff || selectedLines.size === 0) return;
    if (file.staged) return;

    if (!confirm('Are you sure you want to discard the selected changes? This cannot be undone.')) return;

    setProcessing(true);
    try {
      const patch = generatePatch(file.path, diff.hunks, selectedLines);

      const result = await (window as any).electronAPI.applyPatch(patch, {
        reverse: true
      });

      if (result.success) {
        toast.success('Discarded selected changes');
        onRefresh?.();
        onClose();
      } else {
        toast.error(result.error || 'Failed to discard changes');
      }
    } catch (error) {
      console.error('Failed to discard:', error);
      toast.error('An error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const handleDiscardFile = async () => {
    if (!confirm(`Are you sure you want to discard all changes in ${file.path}? This cannot be undone.`)) return;

    setProcessing(true);
    try {
      let result;
      if (file.staged) {
        const unstageResult = await (window as any).electronAPI.gitUnstage([file.path]);
        if (!unstageResult.success) throw new Error(unstageResult.error);
        result = await (window as any).electronAPI.revertFileChanges(file.path);
      } else {
        result = await (window as any).electronAPI.revertFileChanges(file.path);
      }

      if (result.success) {
        toast.success('Discarded file changes');
        onRefresh?.();
        onClose();
      } else {
        toast.error(result.error || 'Failed to discard file');
      }
    } catch (error: any) {
      console.error('Failed to discard file:', error);
      toast.error(error.message || 'An error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const getFileIcon = (status: FileChange['status']) => {
    switch (status) {
      case 'added':
        return <FilePlus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
      case 'deleted':
        return <FileX className="h-4 w-4 text-red-600 dark:text-red-400" />;
      default:
        return <FileText className="h-4 w-4 text-foreground dark:text-foreground" />;
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="text-foreground">Loading file diff...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="flex h-full w-full flex-col rounded-lg border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-muted/30 p-4 sm:p-6">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2 border-r border-border pr-6">
              <button
                onClick={onPrevious}
                disabled={!onPrevious || processing}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-20"
                title="Previous file (Left Arrow)"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={onNext}
                disabled={!onNext || processing}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-20"
                title="Next file (Right Arrow)"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              {getFileIcon(file.status)}
              <span className="font-mono text-lg font-medium text-foreground">{file.path}</span>
              <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-medium border ${file.staged ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'}`}>
                {file.staged ? 'Staged' : 'Unstaged'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 mt-2 sm:mt-0">            {!file.staged && (
              <button
                onClick={handleDiscardFile}
                disabled={processing}
                className="flex items-center gap-2 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                Discard File
              </button>
            )}

            {!file.staged && selectedLines.size > 0 && (
              <button
                onClick={handleDiscardSelected}
                disabled={processing}
                className="flex items-center gap-2 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                Discard Selected Lines
              </button>
            )}

            {selectedLines.size > 0 && (
              <button
                onClick={handleStageSelected}
                disabled={processing}
                className="flex items-center gap-2 rounded-md bg-primary px-4 text-primary-foreground py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap shadow-sm"
              >
                {file.staged ? (
                  <>
                    <Undo2 className="h-4 w-4" />
                    Unstage Selected Lines
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Stage Selected Lines
                  </>
                )}
              </button>
            )}

            <button
              onClick={onClose}
              className="ml-2 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-end border-b border-border bg-card px-4 py-2">
          <div className="flex rounded-md border border-border bg-secondary p-0.5">
            <button
              onClick={() => { setViewMode('split'); setShowBlame(false); }}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${!showBlame && viewMode === 'split'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              Side-by-Side
            </button>
            <button
              onClick={() => { setViewMode('unified'); setShowBlame(false); }}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${!showBlame && viewMode === 'unified'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              Unified
            </button>
            <button
              onClick={() => setShowBlame(true)}
              className={`flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors ${showBlame
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              <History className="h-3 w-3" />
              Blame
            </button>
          </div>
        </div>

        {/* Viewer */}
        <div className="flex min-h-0 flex-1 flex-col bg-background relative overflow-hidden">
          {showBlame ? (
            <BlameViewer filePath={file.path} />
          ) : (
            <DiffViewer
              hunks={diff?.hunks || []}
              viewMode={viewMode}
              readOnly={false}
              selectedLines={selectedLines}
              onToggleLine={toggleLine}
              onToggleHunk={toggleHunk}
            />
          )}
        </div>
      </div>
    </div>
  );
}
