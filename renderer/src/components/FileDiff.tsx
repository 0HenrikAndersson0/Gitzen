import { X, FileText, FilePlus, FileX } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted';
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

interface FileDiffProps {
  file: FileChange;
  onClose: () => void;
}

// Parse diff string into structured format
function parseDiff(diffText: string): FileChange['diff'] {
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

export function FileDiff({ file, onClose }: FileDiffProps) {
  const [diff, setDiff] = useState<FileChange['diff'] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDiff = async () => {
      setLoading(true);
      try {
        const result = await window.electronAPI.getFileDiff(file.path, file.staged);
        if (result.success && result.diff) {
          setDiff(parseDiff(result.diff));
        } else {
          toast.error(result.error || 'Failed to load file diff');
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

  const getFileIcon = (status: FileChange['status']) => {
    switch (status) {
      case 'added':
        return <FilePlus className="h-4 w-4 text-emerald-400" />;
      case 'deleted':
        return <FileX className="h-4 w-4 text-red-400" />;
      default:
        return <FileText className="h-4 w-4 text-blue-400" />;
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-6">
          <div className="text-zinc-100">Loading file diff...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="flex h-[90vh] w-full max-w-7xl flex-col rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-800 p-6">
          <div className="flex items-center gap-2">
            {getFileIcon(file.status)}
            <span className="font-mono text-xl text-zinc-300">{file.path}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Diff Viewer - Side by Side */}
          <div className="flex min-w-0 flex-1 flex-col bg-zinc-950">
            {diff ? (
              <>
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  {/* Side-by-side diff */}
                  <div className="grid min-h-0 flex-1 grid-cols-2">
                    {/* Left pane - Old content */}
                    <div className="flex min-h-0 flex-col border-r border-zinc-800">
                      <div className="border-b border-zinc-800 bg-red-950/20 px-4 py-2">
                        <span className="text-xs font-medium text-red-400">Original</span>
                      </div>
                      <div className="min-h-0 flex-1 overflow-auto bg-zinc-950/50 font-mono text-sm">
                        {diff.hunks.map((hunk, hunkIndex) => (
                          <div key={hunkIndex}>
                            {hunk.lines.map((line, lineIndex) => {
                              if (line.type === 'add') return null;
                              return (
                                <div
                                  key={lineIndex}
                                  className={`flex ${
                                    line.type === 'remove'
                                      ? 'bg-red-950/30'
                                      : 'bg-transparent'
                                  }`}
                                >
                                  <span className="w-12 flex-shrink-0 select-none px-2 text-right text-zinc-600">
                                    {line.oldLineNumber || ''}
                                  </span>
                                  <span
                                    className={`flex-1 px-2 ${
                                      line.type === 'remove'
                                        ? 'bg-red-900/20 text-red-300'
                                        : 'text-zinc-400'
                                    }`}
                                  >
                                    {line.type === 'remove' && (
                                      <span className="mr-1 text-red-400">-</span>
                                    )}
                                    {line.content || '\u00A0'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right pane - New content */}
                    <div className="flex min-h-0 flex-col">
                      <div className="border-b border-zinc-800 bg-emerald-950/20 px-4 py-2">
                        <span className="text-xs font-medium text-emerald-400">Modified</span>
                      </div>
                      <div className="min-h-0 flex-1 overflow-auto bg-zinc-950/50 font-mono text-sm">
                        {diff.hunks.map((hunk, hunkIndex) => (
                          <div key={hunkIndex}>
                            {hunk.lines.map((line, lineIndex) => {
                              if (line.type === 'remove') return null;
                              return (
                                <div
                                  key={lineIndex}
                                  className={`flex ${
                                    line.type === 'add'
                                      ? 'bg-emerald-950/30'
                                      : 'bg-transparent'
                                  }`}
                                >
                                  <span className="w-12 flex-shrink-0 select-none px-2 text-right text-zinc-600">
                                    {line.newLineNumber || ''}
                                  </span>
                                  <span
                                    className={`flex-1 px-2 ${
                                      line.type === 'add'
                                        ? 'bg-emerald-900/20 text-emerald-300'
                                        : 'text-zinc-400'
                                    }`}
                                  >
                                    {line.type === 'add' && (
                                      <span className="mr-1 text-emerald-400">+</span>
                                    )}
                                    {line.content || '\u00A0'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-zinc-500">
                No changes in this file
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
