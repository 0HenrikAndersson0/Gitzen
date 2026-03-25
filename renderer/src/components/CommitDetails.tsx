import { X, FileText, FilePlus, FileX, Copy, Check, History } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { parseDiff, FileChangeDiff } from '../lib/diffUtils';
import { DiffViewer } from './DiffViewer/DiffViewer';
import { BlameViewer } from './BlameViewer';

interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted';
  additions: number;
  deletions: number;
  diff?: FileChangeDiff;
}

interface CommitDetailsProps {
  commit: {
    id: string;
    hash: string;
    message: string;
    author: string;
    timestamp: Date;
    branch?: string;
  };
  onClose: () => void;
}

export function CommitDetails({ commit, onClose }: CommitDetailsProps) {
  const [files, setFiles] = useState<FileChange[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('unified');
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [showBlame, setShowBlame] = useState(false);

  // Reset blame view when switching files
  useEffect(() => {
    setShowBlame(false);
  }, [selectedFile]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const loadDiff = async () => {
      setLoading(true);
      try {
        const result = await (window as any).electronAPI.getCommitDiff(commit.hash);
        if (result.success && result.files) {
          const parsedFiles = result.files.map((file: any) => {
            const diff = file.diff ? parseDiff(file.diff) : undefined;
            return {
              ...file,
              diff,
            };
          });
          setFiles(parsedFiles);
          if (parsedFiles.length > 0) {
            setSelectedFile(parsedFiles[0]);
          }
        } else {
          toast.error(result.error || 'Failed to load commit diff');
        }
      } catch (error) {
        console.error('Failed to load diff:', error);
        toast.error('Failed to load commit diff');
      } finally {
        setLoading(false);
      }
    };

    loadDiff();
  }, [commit.hash]);

  const handleCopyHash = () => {
    navigator.clipboard.writeText(commit.hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.pageX - startX;
      // Constrain sidebar between 200px and 50% of the window width
      const maxWidth = window.innerWidth * 0.5;
      setSidebarWidth(Math.max(200, Math.min(startWidth + delta, maxWidth)));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
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

  const getStatusColor = (status: FileChange['status']) => {
    switch (status) {
      case 'added':
        return 'text-emerald-600 dark:text-emerald-400';
      case 'deleted':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-foreground dark:text-foreground';
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="rounded-lg border border-border bg-card p-6 shadow-lg flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <div className="text-foreground font-medium">Loading commit diff...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 sm:p-6 lg:p-8 animate-in fade-in duration-200">
      <div className="flex h-full w-full flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border bg-muted/30 p-5 sm:px-6 z-10 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="mb-3 text-xl font-semibold text-foreground tracking-tight">
              {commit.message}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground/80 font-medium">
              <span className="text-foreground">{commit.author}</span>
              {commit.branch && (
                <>
                  <span className="opacity-50">•</span>
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs">{commit.branch}</span>
                </>
              )}
              <span className="opacity-50">•</span>
              <button
                onClick={handleCopyHash}
                className="flex items-center gap-1.5 rounded px-2 py-1 font-mono text-xs transition-colors bg-secondary/50 hover:bg-secondary text-foreground/80"
              >
                <code>{commit.hash}</code>
                {copiedHash ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              <span className="opacity-50">•</span>
              <span>{commit.timestamp.toLocaleString()}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ml-4"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* File List Sidebar */}
          <div
            style={{ width: `${sidebarWidth}px` }}
            className="flex flex-col bg-muted/10 shrink-0 border-r border-border"
          >
            <div className="border-b border-border p-4 bg-background z-10 shadow-sm shrink-0">
              <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                Changed Files
                <span className="bg-secondary px-2 py-0.5 rounded-full text-xs font-medium">{files.length}</span>
              </h3>
              <div className="mt-2 flex gap-4 text-xs font-medium">
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <span className="text-[10px] opacity-70">++</span>
                  {files.reduce((sum, f) => sum + f.additions, 0)}
                </span>
                <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                  <span className="text-[10px] opacity-70">--</span>
                  {files.reduce((sum, f) => sum + f.deletions, 0)}
                </span>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-2 space-y-1">
              {files.map((file, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedFile(file)}
                  className={`flex w-full items-start gap-3 rounded-md p-3 text-left transition-all ${selectedFile?.path === file.path
                      ? 'bg-primary/10 border border-primary/20 shadow-sm'
                      : 'hover:bg-accent/50 border border-transparent'
                    }`}
                >
                  <div className="mt-0.5">{getFileIcon(file.status)}</div>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm font-medium ${getStatusColor(file.status)}`}>
                      {file.path.split('/').pop()}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground/70 mt-0.5">{file.path}</div>
                    <div className="mt-1.5 flex gap-3 text-[11px] font-mono">
                      {file.additions > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>
                      )}
                      {file.deletions > 0 && (
                        <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div
            className="w-1.5 shrink-0 bg-transparent hover:bg-primary/50 transition-colors mx-0 cursor-col-resize active:bg-primary flex items-center justify-center -ml-[3px] z-20 group relative"
            onMouseDown={startResizing}
          >
            <div className="absolute inset-y-0 -left-2 -right-2 bg-transparent" />
            <div className="h-8 w-1 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
          </div>

          {/* Diff Viewer Main Area */}
          <div className="flex flex-col bg-background min-w-0 flex-1">
            {selectedFile ? (
              <>
                <div className="flex items-center justify-between border-b border-border bg-card/50 px-5 py-3 shadow-sm z-10 shrink-0">
                  <div className="flex items-center gap-2.5">
                    {getFileIcon(selectedFile.status)}
                    <span className="font-mono text-sm font-medium text-foreground">{selectedFile.path}</span>
                  </div>
                  <div className="flex rounded-md border border-border bg-secondary p-0.5 shadow-sm">
                    <button
                      onClick={() => { setViewMode('split'); setShowBlame(false); }}
                      className={`rounded px-3 py-1 text-xs font-medium transition-all ${!showBlame && viewMode === 'split'
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      Side-by-Side
                    </button>
                    <button
                      onClick={() => { setViewMode('unified'); setShowBlame(false); }}
                      className={`rounded px-3 py-1 text-xs font-medium transition-all ${!showBlame && viewMode === 'unified'
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      Unified
                    </button>
                    <button
                      onClick={() => setShowBlame(true)}
                      className={`flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-all ${showBlame
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      <History className="h-3 w-3" />
                      Blame
                    </button>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
                  {showBlame ? (
                    <BlameViewer filePath={selectedFile.path} commitHash={commit.hash} />
                  ) : (
                    <DiffViewer
                      hunks={selectedFile.diff?.hunks || []}
                      viewMode={viewMode}
                      readOnly={true}
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground gap-4">
                <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
                  <FileText className="h-8 w-8 opacity-50" />
                </div>
                <p>Select a file to view its changes</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
