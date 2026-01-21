import { X, FileText, FilePlus, FileX, Check, Undo2, Save, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted';
  staged: boolean;
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
  onRefresh: () => void;
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

function generatePatch(filePath: string, hunks: DiffHunk[]): string {
  let patch = `diff --git a/${filePath} b/${filePath}\n`;
  patch += `--- a/${filePath}\n`;
  patch += `+++ b/${filePath}\n`;

  for (const hunk of hunks) {
    patch += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
    for (const line of hunk.lines) {
      const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
      patch += `${prefix}${line.content}\n`;
    }
  }

  return patch;
}

export function FileDiff({ file, onClose, onRefresh }: FileDiffProps) {
  const [diff, setDiff] = useState<FileChange['diff'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedHunks, setSelectedHunks] = useState<Set<number>>(new Set());
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const loadDiff = async () => {
      setLoading(true);
      try {
        const result = await window.electronAPI.getFileDiff(file.path, file.staged);
        if (result.success && result.diff) {
          setDiff(parseDiff(result.diff));
          // Default: select all hunks? Or none?
          // Usually easier if none selected, or maybe all.
          // Let's start with none to force explicit selection, or all?
          // If I want to "stage selected", usually I select what I want.
          // But if I want to "commit file", I just close this and commit.
          // Let's start with empty selection.
          setSelectedHunks(new Set());
        } else {
          // If diff is empty/null but success, it might mean no changes or binary
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

  const toggleHunk = (index: number) => {
    const newSelected = new Set(selectedHunks);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedHunks(newSelected);
  };

  const selectAllHunks = () => {
    if (diff) {
      if (selectedHunks.size === diff.hunks.length) {
        setSelectedHunks(new Set());
      } else {
        setSelectedHunks(new Set(diff.hunks.map((_, i) => i)));
      }
    }
  };

  const handleStageSelected = async () => {
    if (!diff || selectedHunks.size === 0) return;
    setProcessing(true);
    try {
      const hunksToProcess = diff.hunks.filter((_, i) => selectedHunks.has(i));
      const patch = generatePatch(file.path, hunksToProcess);

      const result = await window.electronAPI.applyPatch(patch, {
        cached: true,
        reverse: file.staged // If staged, we unstage (apply reverse to index)
      });

      if (result.success) {
        toast.success(file.staged ? 'Unstaged selected changes' : 'Staged selected changes');
        onRefresh();
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
    if (!diff || selectedHunks.size === 0) return;
    // Only allow discarding unstaged changes (revert to index)
    if (file.staged) return;

    if (!confirm('Are you sure you want to discard the selected changes? This cannot be undone.')) return;

    setProcessing(true);
    try {
      const hunksToProcess = diff.hunks.filter((_, i) => selectedHunks.has(i));
      const patch = generatePatch(file.path, hunksToProcess);

      // Discard unstaged changes: apply reverse to working tree
      const result = await window.electronAPI.applyPatch(patch, {
        reverse: true
      });

      if (result.success) {
        toast.success('Discarded selected changes');
        onRefresh();
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
        // If staged, unstage everything first?
        // User probably wants to revert the file to HEAD.
        // Current API `revertFileChanges` does `git checkout -- file`, which reverts worktree to Index.
        // If file is staged, Index has changes. `checkout -- file` will overwrite worktree with Staged version (so no change if already equal).
        // To revert staged file to HEAD: `git reset HEAD file` (unstage) then `git checkout -- file`.

        // Step 1: Unstage
        const unstageResult = await window.electronAPI.gitUnstage([file.path]);
        if (!unstageResult.success) throw new Error(unstageResult.error);

        // Step 2: Revert
        result = await window.electronAPI.revertFileChanges(file.path);
      } else {
        result = await window.electronAPI.revertFileChanges(file.path);
      }

      if (result.success) {
        toast.success('Discarded file changes');
        onRefresh();
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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {getFileIcon(file.status)}
              <span className="font-mono text-xl text-zinc-300">{file.path}</span>
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${file.staged ? 'bg-emerald-900/30 text-emerald-400' : 'bg-amber-900/30 text-amber-400'}`}>
                {file.staged ? 'Staged' : 'Unstaged'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!file.staged && (
               <button
                onClick={handleDiscardFile}
                disabled={processing}
                className="flex items-center gap-2 rounded-md bg-red-950/30 px-3 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-900/50 hover:text-red-300 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Discard File
              </button>
            )}

            {!file.staged && selectedHunks.size > 0 && (
              <button
                onClick={handleDiscardSelected}
                disabled={processing}
                className="flex items-center gap-2 rounded-md bg-red-950/30 px-3 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-900/50 hover:text-red-300 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Discard Selected
              </button>
            )}

            {selectedHunks.size > 0 && (
              <button
                onClick={handleStageSelected}
                disabled={processing}
                className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {file.staged ? (
                   <>
                     <Undo2 className="h-4 w-4" />
                     Unstage Selected
                   </>
                ) : (
                   <>
                     <Check className="h-4 w-4" />
                     Stage Selected
                   </>
                )}
              </button>
            )}

            <button
              onClick={onClose}
              className="ml-4 rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Diff Viewer */}
        <div className="flex min-h-0 flex-1 flex-col bg-zinc-950 overflow-auto">
          {diff ? (
            <div className="flex min-w-full flex-col">
              {diff.hunks.map((hunk, hunkIndex) => (
                <div key={hunkIndex} className="border-b border-zinc-800 last:border-0">
                  {/* Hunk Header */}
                  <div className="sticky top-0 z-10 flex items-center gap-3 bg-zinc-900/95 px-4 py-2 border-y border-zinc-800 backdrop-blur select-none">
                     <div className="flex items-center justify-center rounded hover:bg-zinc-800 p-1 cursor-pointer" onClick={() => toggleHunk(hunkIndex)}>
                        <input
                          type="checkbox"
                          checked={selectedHunks.has(hunkIndex)}
                          onChange={() => {}} // Handle click on parent
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/20 cursor-pointer"
                        />
                     </div>
                    <span className="font-mono text-xs text-zinc-500">
                      @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                    </span>
                  </div>

                  {/* Hunk Content */}
                  <div className="grid grid-cols-2">
                    {/* Left Pane - Original */}
                    <div className="border-r border-zinc-800 bg-zinc-950/30 font-mono text-sm overflow-x-auto">
                      {hunk.lines.map((line, lineIndex) => {
                        if (line.type === 'add') return <div key={lineIndex} className="h-5"></div>; // Spacer, assumes line-height ~1.25rem (20px) which is h-5
                        // Actually let's use explicit styling for consistency
                        return (
                           <div
                              key={lineIndex}
                              className={`flex w-max min-w-full ${
                                line.type === 'remove'
                                  ? 'bg-red-950/30'
                                  : 'bg-transparent'
                              }`}
                            >
                              <span className="w-12 flex-shrink-0 select-none px-2 text-right text-zinc-600 border-r border-zinc-800/50 sticky left-0 bg-inherit z-10">
                                {line.oldLineNumber || ''}
                              </span>
                              <span
                                className={`flex-1 px-2 whitespace-pre ${
                                  line.type === 'remove'
                                    ? 'bg-red-900/20 text-red-300'
                                    : 'text-zinc-400'
                                }`}
                              >
                                {line.type === 'remove' && (
                                  <span className="mr-1 inline-block w-3 select-none text-red-400">-</span>
                                )}
                                {line.content || '\u00A0'}
                              </span>
                            </div>
                        );
                      })}
                    </div>

                    {/* Right Pane - Modified */}
                    <div className="bg-zinc-950/30 font-mono text-sm overflow-x-auto">
                      {hunk.lines.map((line, lineIndex) => {
                        if (line.type === 'remove') return <div key={lineIndex} className="h-5"></div>;
                        return (
                           <div
                              key={lineIndex}
                              className={`flex w-max min-w-full ${
                                line.type === 'add'
                                  ? 'bg-emerald-950/30'
                                  : 'bg-transparent'
                              }`}
                            >
                              <span className="w-12 flex-shrink-0 select-none px-2 text-right text-zinc-600 border-r border-zinc-800/50 sticky left-0 bg-inherit z-10">
                                {line.newLineNumber || ''}
                              </span>
                              <span
                                className={`flex-1 px-2 whitespace-pre ${
                                  line.type === 'add'
                                    ? 'bg-emerald-900/20 text-emerald-300'
                                    : 'text-zinc-400'
                                }`}
                              >
                                {line.type === 'add' && (
                                  <span className="mr-1 inline-block w-3 select-none text-emerald-400">+</span>
                                )}
                                {line.content || '\u00A0'}
                              </span>
                            </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-zinc-500">
              No changes in this file
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
