import React from 'react';
import { DiffHunk, DiffLine } from '../lib/diffUtils';

export interface DiffViewerProps {
    hunks: DiffHunk[];
    viewMode: 'split' | 'unified';
    readOnly?: boolean;
    selectedLines?: Set<string>;
    onToggleLine?: (hunkIdx: number, lineIdx: number) => void;
    onToggleHunk?: (hunkIdx: number) => void;
}

const WordDiffViewer: React.FC<{ line: DiffLine; isAdd: boolean }> = ({ line, isAdd }) => {
    if (!line.wordDiff) {
        return <span>{line.content || ' '}</span>;
    }

    return (
        <>
            {line.wordDiff.map((part: any, index: number) => {
                // If we are rendering the 'add' line (isAdd=true), we highlight 'added' parts and ignore 'removed' parts (or vice versa maybe? No, wordDiff from `diffWords` gives parts that are added, removed, or unchanged).
                // Wait, diffWords outputs { value, added, removed }
                if (isAdd) {
                    if (part.removed) return null; // Don't show removed words on the 'new' line
                    if (part.added) {
                        return (
                            <span key={index} className="bg-emerald-300 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100 rounded-sm px-0.5">
                                {part.value}
                            </span>
                        );
                    }
                } else {
                    if (part.added) return null; // Don't show added words on the 'old' line
                    if (part.removed) {
                        return (
                            <span key={index} className="bg-red-300 dark:bg-red-800 text-red-900 dark:text-red-100 rounded-sm px-0.5">
                                {part.value}
                            </span>
                        );
                    }
                }

                // Unchanged text
                return <span key={index}>{part.value}</span>;
            })}
        </>
    );
};

export const DiffViewer: React.FC<DiffViewerProps> = ({
    hunks,
    viewMode,
    readOnly = true,
    selectedLines = new Set(),
    onToggleLine,
    onToggleHunk
}) => {
    if (!hunks || hunks.length === 0) {
        return (
            <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">
                No changes to display
            </div>
        );
    }

    const renderUnified = () => {
        return (
            <div className="flex min-w-full flex-col bg-background/50 font-mono text-[13px] leading-5">
                {hunks.map((hunk, hunkIndex) => {
                    let allSelected = true;
                    let hasChanges = false;
                    hunk.lines.forEach((l: DiffLine, i: number) => {
                        if (l.type !== 'context') {
                            hasChanges = true;
                            if (!selectedLines.has(`${hunkIndex}-${i}`)) allSelected = false;
                        }
                    });

                    return (
                        <div key={hunkIndex} className="border-b border-border last:border-0 pb-2">
                            <div className="sticky top-0 z-10 flex items-center gap-3 bg-muted/80 backdrop-blur px-4 py-1.5 border-y border-border/50 text-xs text-muted-foreground select-none">
                                {!readOnly && hasChanges && (
                                    <div
                                        className="flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 p-1 cursor-pointer"
                                        onClick={(e) => { e.stopPropagation(); onToggleHunk?.(hunkIndex); }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={() => { }}
                                            className="h-3.5 w-3.5 rounded border-border cursor-pointer bg-background"
                                        />
                                    </div>
                                )}
                                <span>@@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@</span>
                            </div>

                            <div className="flex flex-col min-w-fit">
                                {hunk.lines.map((line: DiffLine, lineIndex: number) => {
                                    const isSelectable = !readOnly && line.type !== 'context';
                                    const isSelected = selectedLines.has(`${hunkIndex}-${lineIndex}`);

                                    return (
                                        <div
                                            key={lineIndex}
                                            className={`flex group hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${line.type === 'add'
                                                ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                                                : line.type === 'remove'
                                                    ? 'bg-red-50/50 dark:bg-red-950/20'
                                                    : 'bg-transparent'
                                                }`}
                                            onClick={() => isSelectable && onToggleLine?.(hunkIndex, lineIndex)}
                                        >
                                            <div className="flex w-[120px] flex-shrink-0 select-none border-r border-border/50 sticky left-0 bg-inherit z-10 items-center">
                                                <span className="w-12 px-2 text-right text-muted-foreground/60 select-none">
                                                    {line.oldLineNumber || ''}
                                                </span>
                                                <span className="w-12 px-2 text-right text-muted-foreground/60 select-none">
                                                    {line.newLineNumber || ''}
                                                </span>
                                                {!readOnly && (
                                                    <div className="flex w-6 items-center justify-center">
                                                        {isSelectable && (
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => { }}
                                                                className="h-3 w-3 rounded-sm border-border opacity-0 group-hover:opacity-100 data-[checked=true]:opacity-100 transition-opacity cursor-pointer"
                                                                data-checked={isSelected}
                                                            />
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            <div className={`flex flex-1 px-4 whitespace-pre-wrap break-all ${line.type === 'add'
                                                ? 'text-emerald-700 dark:text-emerald-300'
                                                : line.type === 'remove'
                                                    ? 'text-red-700 dark:text-red-300'
                                                    : 'text-foreground/80'
                                                }`}>
                                                <span className="mr-3 select-none text-muted-foreground/40 font-bold inline-block w-4 text-center">
                                                    {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                                                </span>
                                                <WordDiffViewer line={line} isAdd={line.type === 'add'} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderSplit = () => {
        return (
            <div className="flex min-w-full flex-col bg-background/50 font-mono text-[13px] leading-5">
                {/* Sticky Header for Columns */}
                <div className="sticky top-0 z-20 grid min-w-full border-b border-border bg-muted/80 backdrop-blur" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="px-4 py-1.5 text-xs font-medium text-foreground/70 border-r border-border/50">
                        Original
                    </div>
                    <div className="px-4 py-1.5 text-xs font-medium text-foreground/70">
                        Modified
                    </div>
                </div>

                {hunks.map((hunk, hunkIndex) => {
                    let allSelected = true;
                    let hasChanges = false;
                    hunk.lines.forEach((l: DiffLine, i: number) => {
                        if (l.type !== 'context') {
                            hasChanges = true;
                            if (!selectedLines.has(`${hunkIndex}-${i}`)) allSelected = false;
                        }
                    });

                    // Pre-process lines to align them if they are adjacent additions/removals
                    // This gives that nice side-by-side gap effect where removes match with blank space on the right, etc.
                    // For simplicity, we align sequentially.
                    const rows: { left?: { line: DiffLine, idx: number }, right?: { line: DiffLine, idx: number } }[] = [];

                    let i = 0;
                    while (i < hunk.lines.length) {
                        const line = hunk.lines[i];
                        if (line.type === 'context') {
                            rows.push({ left: { line, idx: i }, right: { line, idx: i } });
                            i++;
                        } else if (line.type === 'remove') {
                            // Collect all contiguous removes
                            const startRm = i;
                            while (i < hunk.lines.length && hunk.lines[i].type === 'remove') i++;
                            const endRm = i;

                            // Collect all contiguous adds right after
                            const startAdd = i;
                            while (i < hunk.lines.length && hunk.lines[i].type === 'add') i++;
                            const endAdd = i;

                            const rmCount = endRm - startRm;
                            const adCount = endAdd - startAdd;
                            const maxCount = Math.max(rmCount, adCount);

                            for (let j = 0; j < maxCount; j++) {
                                rows.push({
                                    left: j < rmCount ? { line: hunk.lines[startRm + j], idx: startRm + j } : undefined,
                                    right: j < adCount ? { line: hunk.lines[startAdd + j], idx: startAdd + j } : undefined,
                                });
                            }
                        } else if (line.type === 'add') {
                            rows.push({ right: { line, idx: i } });
                            i++;
                        }
                    }

                    return (
                        <div key={hunkIndex} className="border-b border-border last:border-0 pb-2">
                            <div className="sticky top-[31px] z-10 flex items-center gap-3 bg-muted/80 backdrop-blur px-4 py-1 border-y border-border/50 text-xs text-muted-foreground select-none">
                                {!readOnly && hasChanges && (
                                    <div
                                        className="flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 p-1 cursor-pointer"
                                        onClick={(e) => { e.stopPropagation(); onToggleHunk?.(hunkIndex); }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={() => { }}
                                            className="h-3.5 w-3.5 rounded border-border cursor-pointer bg-background"
                                        />
                                    </div>
                                )}
                                <span>@@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@</span>
                            </div>

                            <div className="flex flex-col min-w-fit">
                                {rows.map((row: { left?: { line: DiffLine, idx: number }, right?: { line: DiffLine, idx: number } }, rowIndex: number) => {
                                    const getCell = (side: 'left' | 'right') => {
                                        const item = side === 'left' ? row.left : row.right;
                                        if (!item) {
                                            // Empty filler cell
                                            return <div className="flex-1 bg-black/5 dark:bg-white/5" />;
                                        }

                                        const { line, idx } = item;
                                        const isSelectable = !readOnly && line.type !== 'context';
                                        const isSelected = selectedLines.has(`${hunkIndex}-${idx}`);

                                        return (
                                            <div
                                                className={`flex flex-1 group hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer ${line.type === 'add'
                                                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                                                    : line.type === 'remove'
                                                        ? 'bg-red-50/50 dark:bg-red-950/20'
                                                        : 'bg-transparent'
                                                    }`}
                                                onClick={() => isSelectable && onToggleLine?.(hunkIndex, idx)}
                                            >
                                                <div className="flex w-[80px] flex-shrink-0 select-none border-r border-border/50 sticky left-0 bg-inherit z-10 items-center justify-end px-2">
                                                    {!readOnly && isSelectable && (
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => { }}
                                                            className="mr-2 h-3 w-3 rounded-sm border-border opacity-0 group-hover:opacity-100 data-[checked=true]:opacity-100 transition-opacity cursor-pointer flex-shrink-0"
                                                            data-checked={isSelected}
                                                        />
                                                    )}
                                                    <span className="text-right text-muted-foreground/60 w-10">
                                                        {side === 'left' ? line.oldLineNumber : line.newLineNumber}
                                                    </span>
                                                </div>

                                                <div className={`flex flex-1 px-4 whitespace-pre-wrap break-all ${line.type === 'add'
                                                    ? 'text-emerald-700 dark:text-emerald-300'
                                                    : line.type === 'remove'
                                                        ? 'text-red-700 dark:text-red-300'
                                                        : 'text-foreground/80'
                                                    }`}>
                                                    <span className="mr-3 select-none text-muted-foreground/40 font-bold inline-block w-4 text-center">
                                                        {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                                                    </span>
                                                    <span className="flex-1">
                                                        <WordDiffViewer line={line} isAdd={line.type === 'add'} />
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    };

                                    return (
                                        <div key={rowIndex} className="flex min-w-full" style={{ minHeight: '1.25rem' }}>
                                            <div className="flex-1 border-r border-border/50 min-w-0 flex">
                                                {getCell('left')}
                                            </div>
                                            <div className="flex-1 min-w-0 flex">
                                                {getCell('right')}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="overflow-auto min-h-0 flex-1 bg-background/30 rounded-md border border-border shadow-inner">
            {viewMode === 'unified' ? renderUnified() : renderSplit()}
        </div>
    );
};
