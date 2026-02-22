import { X, FileText, FilePlus, FileX, Check, Undo2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
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
  onNext?: () => void;
  onPrevious?: () => void;
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
    if (!line) continue;
    if (line.startsWith('@@')) {
      // New hunk
      if (currentHunk) {
        hunks.push(currentHunk);
      }

      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        oldLineNum = parseInt(match[1]) || 0;
        newLineNum = parseInt(match[3]) || 0;
        const oldLines = match[2] ? parseInt(match[2]) : 1;
        const newLines = match[4] ? parseInt(match[4]) : 1;

        currentHunk = {
          oldStart: oldLineNum,
          oldLines,
          newStart: newLineNum,
          newLines,
          lines: [],
        };
      }
    } else if (currentHunk) {
      if (line.startsWith('\\')) continue;
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

function generatePatch(filePath: string, hunks: DiffHunk[], selectedLines: Set<string>): string {
  let patch = `diff --git a/${filePath} b/${filePath}\n`;
  patch += `--- a/${filePath}\n`;
  patch += `+++ b/${filePath}\n`;

  let accumulatedDrift = 0;

  for (let i = 0; i < hunks.length; i++) {
    const hunk = hunks[i];
    let newHunkLines: string[] = [];
    let oldLinesCount = 0;
    let newLinesCount = 0;
    let hasChanges = false;

    for (let j = 0; j < hunk.lines.length; j++) {
      const line = hunk.lines[j];
      const lineKey = `${i}-${j}`;
      const isSelected = selectedLines.has(lineKey);

      if (line.type === 'context') {
        newHunkLines.push(` ${line.content}`);
        oldLinesCount++;
        newLinesCount++;
      } else if (line.type === 'add') {
        if (isSelected) {
          newHunkLines.push(`+${line.content}`);
          newLinesCount++;
          hasChanges = true;
        } else {
          // Skip unselected add
        }
      } else if (line.type === 'remove') {
        if (isSelected) {
          newHunkLines.push(`-${line.content}`);
          oldLinesCount++;
          hasChanges = true;
        } else {
          // Treat unselected remove as context
          newHunkLines.push(` ${line.content}`);
          oldLinesCount++;
          newLinesCount++;
        }
      }
    }

    if (hasChanges) {
      const newStart = hunk.newStart + accumulatedDrift;
      
      patch += `@@ -${hunk.oldStart},${oldLinesCount} +${newStart},${newLinesCount} @@\n`;
      patch += newHunkLines.join('\n') + '\n';
      
      // Update drift based on the changes we just output
      const currentDrift = (newLinesCount - oldLinesCount) - (hunk.newLines - hunk.oldLines);
      accumulatedDrift += currentDrift;
    } else {
      // If we skip the hunk entirely, we are effectively reverting it to the old state (no change).
      // The drift is the difference between "no change" (0 length change) and the "original change" (hunk.newLines - hunk.oldLines).
      // effectively: 0 - (originalNew - originalOld)
      const currentDrift = -(hunk.newLines - hunk.oldLines);
      accumulatedDrift += currentDrift;
    }
  }

  return patch;
}

export function FileDiff({ file, onClose, onRefresh, onNext, onPrevious }: FileDiffProps) {
  const [diff, setDiff] = useState<FileChange['diff'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');

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
        const result = await window.electronAPI.getFileDiff(file.path, file.staged);
        if (result.success && result.diff) {
          const parsed = parseDiff(result.diff);
          setDiff(parsed);
          // Auto-select all change lines initially?
          // No, user requested "select and deselect". Defaulting to empty is safer for partial staging.
          // Or defaulting to All is more convenient if they usually stage all?
          // Let's default to Empty to make "Partial" explicit.
          // Wait, if I open diff I usually want to stage everything unless I uncheck something.
          // But the previous implementation selected none.
          // Let's select ALL by default, so it behaves like "Stage File" but allows deselection.
          const allLines = new Set<string>();
          parsed!.hunks.forEach((h, hIdx) => {
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
    
    // Check if all changes in hunk are selected
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

    // Toggle
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

      const result = await window.electronAPI.applyPatch(patch, {
        cached: true,
        reverse: file.staged
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
    if (!diff || selectedLines.size === 0) return;
    if (file.staged) return;

    if (!confirm('Are you sure you want to discard the selected changes? This cannot be undone.')) return;

    setProcessing(true);
    try {
      const patch = generatePatch(file.path, diff.hunks, selectedLines);

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
        const unstageResult = await window.electronAPI.gitUnstage([file.path]);
        if (!unstageResult.success) throw new Error(unstageResult.error);
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
      <div className="flex h-full w-full flex-col rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-800 p-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 border-r border-zinc-800 pr-6">
              <button
                onClick={onPrevious}
                disabled={!onPrevious || processing}
                className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-20"
                title="Previous file (Left Arrow)"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={onNext}
                disabled={!onNext || processing}
                className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-20"
                title="Next file (Right Arrow)"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>
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

            {!file.staged && selectedLines.size > 0 && (
              <button
                onClick={handleDiscardSelected}
                disabled={processing}
                className="flex items-center gap-2 rounded-md bg-red-950/30 px-3 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-900/50 hover:text-red-300 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Discard Selected Lines
              </button>
            )}

            {selectedLines.size > 0 && (
              <button
                onClick={handleStageSelected}
                disabled={processing}
                className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
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
              className="ml-4 rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-end border-b border-zinc-800 bg-zinc-900/50 px-6 py-2">
          <div className="flex rounded-md border border-zinc-700 bg-zinc-800 p-0.5">
            <button
              onClick={() => setViewMode('split')}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                viewMode === 'split'
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Side-by-Side
            </button>
            <button
              onClick={() => setViewMode('unified')}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                viewMode === 'unified'
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Unified
            </button>
          </div>
        </div>

        {/* Diff Viewer */}
        <div className="flex min-h-0 flex-1 flex-col bg-zinc-950 overflow-auto">
          {diff ? (
            <div className="flex min-w-full w-fit flex-col">
              {viewMode === 'split' ? (
                /* Side-by-Side View */
                diff.hunks.map((hunk, hunkIndex) => {
                   // Check if all valid lines in hunk are selected
                   let allSelected = true;
                   let hasChanges = false;
                   hunk.lines.forEach((l, i) => {
                     if (l.type !== 'context') {
                       hasChanges = true;
                       if (!selectedLines.has(`${hunkIndex}-${i}`)) allSelected = false;
                     }
                   });

                   return (
                    <div key={hunkIndex} className="border-b border-zinc-800 last:border-0">
                      {/* Hunk Header */}
                      <div className="sticky top-0 z-10 flex items-center gap-3 bg-zinc-900/95 px-4 py-2 border-y border-zinc-800 backdrop-blur select-none">
                         {hasChanges && (
                           <div className="flex items-center justify-center rounded hover:bg-zinc-800 p-1 cursor-pointer" onClick={() => toggleHunk(hunkIndex)}>
                              <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={() => {}} 
                                className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/20 cursor-pointer"
                              />
                           </div>
                         )}
                        <span className="font-mono text-xs text-zinc-500">
                          @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                        </span>
                      </div>

                      {/* Hunk Content */}
                      <div className="grid min-w-full" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        {/* Left Pane - Original */}
                        <div className="border-r border-zinc-800 bg-zinc-950/30 font-mono text-sm">
                          {hunk.lines.map((line, lineIndex) => {
                            const isAddition = line.type === 'add';
                            const isSelectable = line.type === 'remove';
                            const isSelected = selectedLines.has(`${hunkIndex}-${lineIndex}`);

                            return (
                               <div
                                  key={lineIndex}
                                  className={`flex h-5 w-max min-w-full group ${
                                    line.type === 'remove'
                                      ? 'bg-red-950/30'
                                      : 'bg-transparent'
                                  }`}
                                  onClick={() => isSelectable && toggleLine(hunkIndex, lineIndex)}
                                >
                                  <span className="w-16 flex-shrink-0 select-none px-2 text-right text-zinc-600 border-r border-zinc-800/50 sticky left-0 bg-inherit z-10 flex items-center justify-end gap-2">
                                    {isSelectable && (
                                      <input 
                                        type="checkbox" 
                                        checked={isSelected} 
                                        onChange={() => {}}
                                        className="h-3 w-3 rounded-sm border-zinc-600 bg-zinc-800 text-blue-500 opacity-0 group-hover:opacity-100 data-[checked=true]:opacity-100"
                                        data-checked={isSelected}
                                      />
                                    )}
                                    {!isAddition ? line.oldLineNumber || '' : ''}
                                  </span>
                                  <span
                                    className={`flex-1 px-2 whitespace-pre cursor-pointer ${
                                      line.type === 'remove'
                                        ? 'bg-red-900/20 text-red-300'
                                        : 'text-zinc-400'
                                    }`}
                                  >
                                    {!isAddition && (
                                      <>
                                        {line.type === 'remove' && (
                                          <span className="mr-1 inline-block w-3 select-none text-red-400">-</span>
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
                        <div className="bg-zinc-950/30 font-mono text-sm">
                          {hunk.lines.map((line, lineIndex) => {
                            const isRemoval = line.type === 'remove';
                            const isSelectable = line.type === 'add';
                            const isSelected = selectedLines.has(`${hunkIndex}-${lineIndex}`);

                            return (
                               <div
                                  key={lineIndex}
                                  className={`flex h-5 w-max min-w-full group ${
                                    line.type === 'add'
                                      ? 'bg-emerald-950/30'
                                      : 'bg-transparent'
                                  }`}
                                  onClick={() => isSelectable && toggleLine(hunkIndex, lineIndex)}
                                >
                                  <span className="w-16 flex-shrink-0 select-none px-2 text-right text-zinc-600 border-r border-zinc-800/50 sticky left-0 bg-inherit z-10 flex items-center justify-end gap-2">
                                    {isSelectable && (
                                      <input 
                                        type="checkbox" 
                                        checked={isSelected} 
                                        onChange={() => {}}
                                        className="h-3 w-3 rounded-sm border-zinc-600 bg-zinc-800 text-blue-500 opacity-0 group-hover:opacity-100 data-[checked=true]:opacity-100"
                                        data-checked={isSelected}
                                      />
                                    )}
                                    {!isRemoval ? line.newLineNumber || '' : ''}
                                  </span>
                                  <span
                                    className={`flex-1 px-2 whitespace-pre cursor-pointer ${
                                      line.type === 'add'
                                        ? 'bg-emerald-900/20 text-emerald-300'
                                        : 'text-zinc-400'
                                    }`}
                                  >
                                    {!isRemoval && (
                                      <>
                                        {line.type === 'add' && (
                                          <span className="mr-1 inline-block w-3 select-none text-emerald-400">+</span>
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
                  );
                })
              ) : (
                /* Unified View */
                diff.hunks.map((hunk, hunkIndex) => {
                   let allSelected = true;
                   let hasChanges = false;
                   hunk.lines.forEach((l, i) => {
                     if (l.type !== 'context') {
                       hasChanges = true;
                       if (!selectedLines.has(`${hunkIndex}-${i}`)) allSelected = false;
                     }
                   });

                   return (
                    <div key={hunkIndex} className="border-b border-zinc-800 last:border-0">
                      {/* Hunk Header */}
                      <div className="sticky top-0 z-10 flex items-center gap-3 bg-zinc-900/95 px-4 py-2 border-y border-zinc-800 backdrop-blur select-none">
                         {hasChanges && (
                           <div className="flex items-center justify-center rounded hover:bg-zinc-800 p-1 cursor-pointer" onClick={() => toggleHunk(hunkIndex)}>
                              <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={() => {}} 
                                className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/20 cursor-pointer"
                              />
                           </div>
                         )}
                        <span className="font-mono text-xs text-zinc-500">
                          @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                        </span>
                      </div>

                      <div className="bg-zinc-950/30 font-mono text-sm overflow-x-auto">
                        {hunk.lines.map((line, lineIndex) => {
                          const isSelectable = line.type !== 'context';
                          const isSelected = selectedLines.has(`${hunkIndex}-${lineIndex}`);

                          return (
                            <div
                              key={lineIndex}
                              className={`flex w-max min-w-full group ${
                                line.type === 'add'
                                  ? 'bg-emerald-950/30'
                                  : line.type === 'remove'
                                  ? 'bg-red-950/30'
                                  : 'bg-transparent'
                              }`}
                              onClick={() => isSelectable && toggleLine(hunkIndex, lineIndex)}
                            >
                              <div className="flex w-32 flex-shrink-0 select-none border-r border-zinc-800/50 sticky left-0 bg-inherit z-10">
                                <span className="w-12 px-2 text-right text-zinc-600">
                                  {line.oldLineNumber || ''}
                                </span>
                                <span className="w-12 px-2 text-right text-zinc-600">
                                  {line.newLineNumber || ''}
                                </span>
                                <div className="flex w-8 items-center justify-center">
                                  {isSelectable && (
                                    <input 
                                      type="checkbox" 
                                      checked={isSelected} 
                                      onChange={() => {}}
                                      className="h-3 w-3 rounded-sm border-zinc-600 bg-zinc-800 text-blue-500 opacity-0 group-hover:opacity-100 data-[checked=true]:opacity-100"
                                      data-checked={isSelected}
                                    />
                                  )}
                                </div>
                              </div>
                              <span
                                className={`flex-1 px-4 whitespace-pre cursor-pointer ${
                                  line.type === 'add'
                                    ? 'bg-emerald-900/20 text-emerald-300'
                                    : line.type === 'remove'
                                    ? 'bg-red-900/20 text-red-300'
                                    : 'text-zinc-400'
                                }`}
                              >
                                {line.type === 'add' ? (
                                  <span className="mr-2 text-emerald-400 font-bold">+</span>
                                ) : line.type === 'remove' ? (
                                  <span className="mr-2 text-red-400 font-bold">-</span>
                                ) : (
                                  <span className="mr-2 text-zinc-600"> </span>
                                )}
                                {line.content || ''}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                   );
                })
              )}
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
