import { X, FileText, FilePlus, FileX, Copy, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted';
  additions: number;
  deletions: number;
  diff?: {
    oldContent: string[];
    newContent: string[];
    hunks: DiffHunk[];
  };
}

interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

interface DiffLine {
  type: 'add' | 'remove' | 'context';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
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

// Parse diff string into structured format
function parseDiff(diffText: string, path: string): FileChange['diff'] {
  const lines = diffText.split('\n');
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;
  const oldContent: string[] = [];
  const newContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // New hunk
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      
      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match) {
        oldLineNum = parseInt(match[1]) || 0;
        newLineNum = parseInt(match[3]) || 0;
        const oldLines = parseInt(match[2]) || 0;
        const newLines = parseInt(match[4]) || 0;
        
        currentHunk = {
          oldStart: oldLineNum,
          oldLines,
          newStart: newLineNum,
          newLines,
          lines: [],
        };
      }
    } else if (currentHunk) {
      const type = line[0] === '+' ? 'add' : line[0] === '-' ? 'remove' : 'context';
      const content = line.substring(1);
      
      let oldLine: number | undefined;
      let newLine: number | undefined;
      
      if (type === 'remove') {
        oldLine = oldLineNum++;
        oldContent.push(content);
      } else if (type === 'add') {
        newLine = newLineNum++;
        newContent.push(content);
      } else {
        oldLine = oldLineNum++;
        newLine = newLineNum++;
        oldContent.push(content);
        newContent.push(content);
      }
      
      currentHunk.lines.push({
        type,
        oldLineNumber: oldLine,
        newLineNumber: newLine,
        content,
      });
    }
  }
  
  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return { oldContent, newContent, hunks };
}

export function CommitDetails({ commit, onClose }: CommitDetailsProps) {
  const [files, setFiles] = useState<FileChange[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('unified');

  useEffect(() => {
    const loadDiff = async () => {
      setLoading(true);
      try {
        const result = await window.electronAPI.getCommitDiff(commit.hash);
        if (result.success && result.files) {
          const parsedFiles = result.files.map((file) => {
            const diff = file.diff ? parseDiff(file.diff, file.path) : undefined;
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="text-foreground">Loading commit diff...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="flex h-full w-full flex-col rounded-lg border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-6">
          <div className="min-w-0 flex-1">
            <h2 className="mb-2 text-xl font-semibold text-foreground">
              {commit.message}
            </h2>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span>{commit.author}</span>
              {commit.branch && (
                <>
                  <span>•</span>
                  <span>{commit.branch}</span>
                </>
              )}
              <span>•</span>
              <button
                onClick={handleCopyHash}
                className="flex items-center gap-1.5 rounded px-2 py-1 font-mono text-xs transition-colors hover:bg-accent hover:text-foreground"
              >
                <code>{commit.hash}</code>
                {copiedHash ? (
                  <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
              <span>•</span>
              <span>{commit.timestamp.toLocaleString()}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* File List Sidebar */}
          <div className="w-80 border-r border-border bg-card/50">
            <div className="border-b border-border p-4">
              <h3 className="font-medium text-foreground">
                Changed Files ({files.length})
              </h3>
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span className="text-emerald-600 dark:text-emerald-400">
                  +{files.reduce((sum, f) => sum + f.additions, 0)}
                </span>
                <span className="text-red-600 dark:text-red-400">
                  -{files.reduce((sum, f) => sum + f.deletions, 0)}
                </span>
              </div>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 180px)' }}>
              {files.map((file, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedFile(file)}
                  className={`flex w-full items-start gap-3 border-b border-border p-4 text-left transition-colors ${
                    selectedFile?.path === file.path
                      ? 'bg-secondary'
                      : 'hover:bg-accent/50'
                  }`}
                >
                  {getFileIcon(file.status)}
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm font-medium ${getStatusColor(file.status)}`}>
                      {file.path.split('/').pop()}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{file.path}</div>
                    <div className="mt-1 flex gap-3 text-xs">
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

          {/* Diff Viewer - Side by Side */}
          <div className="flex min-w-0 flex-1 flex-col bg-background">
            {selectedFile ? (
              <>
                <div className="flex items-center justify-between border-b border-border bg-card/50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    {getFileIcon(selectedFile.status)}
                    <span className="font-mono text-sm text-foreground">{selectedFile.path}</span>
                  </div>
                  <div className="flex rounded-md border border-border bg-secondary p-0.5">
                    <button
                      onClick={() => setViewMode('split')}
                      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                        viewMode === 'split'
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Side-by-Side
                    </button>
                    <button
                      onClick={() => setViewMode('unified')}
                      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                        viewMode === 'unified'
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Unified
                    </button>
                  </div>
                </div>
                
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  {viewMode === 'split' ? (
                    /* Side-by-side diff with synchronized scrolling */
                    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
                      <div className="flex min-w-full w-fit flex-col">
                        {/* Sticky Header for Columns */}
                        <div className="sticky top-0 z-20 grid min-w-full border-b border-border bg-card" style={{ gridTemplateColumns: '1fr 1fr' }}>
                          <div className="border-r border-border bg-red-100 dark:bg-red-950/20 px-4 py-2 text-xs font-medium text-red-600 dark:text-red-400">
                            Original
                          </div>
                          <div className="bg-emerald-100 dark:bg-emerald-950/20 px-4 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            Modified
                          </div>
                        </div>

                        <div className="flex min-w-full flex-col bg-background/50 font-mono text-sm">
                          {selectedFile.diff?.hunks.map((hunk, hunkIndex) => (
                            <div key={hunkIndex} className="border-b border-border last:border-0">
                              {/* Hunk Header */}
                              <div className="sticky top-[33px] z-10 bg-card/95 px-4 py-1 text-xs text-muted-foreground border-y border-border/50 backdrop-blur">
                                @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                              </div>

                              {/* Hunk Content */}
                              <div className="grid min-w-full" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                {/* Left Pane - Original */}
                                <div className="border-r border-border bg-background/30">
                                  {hunk.lines.map((line, lineIndex) => {
                                    const isAddition = line.type === 'add';
                                    return (
                                      <div
                                        key={lineIndex}
                                        className={`flex h-5 ${
                                          line.type === 'remove'
                                            ? 'bg-red-100 dark:bg-red-950/30'
                                            : 'bg-transparent'
                                        }`}
                                      >
                                        <span className="w-12 flex-shrink-0 select-none px-2 text-right text-muted-foreground border-r border-border/50">
                                          {!isAddition ? line.oldLineNumber || '' : ''}
                                        </span>
                                        <span
                                          className={`flex-1 px-2 whitespace-pre ${
                                            line.type === 'remove'
                                              ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                                              : 'text-muted-foreground'
                                          }`}
                                        >
                                          {!isAddition && (
                                            <>
                                              {line.type === 'remove' && (
                                                <span className="mr-1 text-red-600 dark:text-red-400">-</span>
                                              )}
                                              {line.content || ''}
                                            </>
                                          )}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Right Pane - Modified */}
                                <div className="bg-background/30">
                                  {hunk.lines.map((line, lineIndex) => {
                                    const isRemoval = line.type === 'remove';
                                    return (
                                      <div
                                        key={lineIndex}
                                        className={`flex h-5 ${
                                          line.type === 'add'
                                            ? 'bg-emerald-100 dark:bg-emerald-950/30'
                                            : 'bg-transparent'
                                        }`}
                                      >
                                        <span className="w-12 flex-shrink-0 select-none px-2 text-right text-muted-foreground border-r border-border/50">
                                          {!isRemoval ? line.newLineNumber || '' : ''}
                                        </span>
                                        <span
                                          className={`flex-1 px-2 whitespace-pre ${
                                            line.type === 'add'
                                              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                                              : 'text-muted-foreground'
                                          }`}
                                        >
                                          {!isRemoval && (
                                            <>
                                              {line.type === 'add' && (
                                                <span className="mr-1 text-emerald-600 dark:text-emerald-400">+</span>
                                              )}
                                              {line.content || ''}
                                            </>
                                          )}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Unified diff */
                    <div className="min-h-0 flex-1 overflow-auto bg-background/50 font-mono text-sm">
                      {selectedFile.diff?.hunks.map((hunk, hunkIndex) => (
                        <div key={hunkIndex}>
                          <div className="sticky top-0 z-10 bg-card/95 px-4 py-1 text-xs text-muted-foreground border-y border-border/50 backdrop-blur">
                            @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                          </div>
                          {hunk.lines.map((line, lineIndex) => (
                            <div
                              key={lineIndex}
                              className={`flex ${
                                line.type === 'add'
                                  ? 'bg-emerald-100 dark:bg-emerald-950/30'
                                  : line.type === 'remove'
                                  ? 'bg-red-100 dark:bg-red-950/30'
                                  : 'bg-transparent'
                              }`}
                            >
                              <div className="flex w-24 flex-shrink-0 select-none border-r border-border/50">
                                <span className="w-12 px-2 text-right text-muted-foreground">
                                  {line.oldLineNumber || ''}
                                </span>
                                <span className="w-12 px-2 text-right text-muted-foreground">
                                  {line.newLineNumber || ''}
                                </span>
                              </div>
                              <span
                                className={`flex-1 px-4 whitespace-pre ${
                                  line.type === 'add'
                                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                                    : line.type === 'remove'
                                    ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                {line.type === 'add' ? (
                                  <span className="mr-2 text-emerald-600 dark:text-emerald-400">+</span>
                                ) : line.type === 'remove' ? (
                                  <span className="mr-2 text-red-600 dark:text-red-400">-</span>
                                ) : (
                                  <span className="mr-2 text-muted-foreground"> </span>
                                )}
                                {line.content || ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                No file selected
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

