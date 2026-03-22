import { diffWordsWithSpace, Change } from 'diff';

export interface DiffLine {
    type: 'add' | 'remove' | 'context';
    oldLineNumber?: number;
    newLineNumber?: number;
    content: string;
    wordDiff?: Change[]; // For word-level highlighting
}

export interface DiffHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: DiffLine[];
}

export interface FileChangeDiff {
    oldContent: string[];
    newContent: string[];
    hunks: DiffHunk[];
}

/**
 * Parses a standard raw git diff string into a structured format.
 */
export function parseDiff(diffText: string): FileChangeDiff {
    const lines = diffText.split('\n');
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    let oldLineNum = 0;
    let newLineNum = 0;
    const oldContent: string[] = [];
    const newContent: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line && i === lines.length - 1) continue;

        if (line.startsWith('@@')) {
            if (currentHunk) {
                hunks.push(currentHunk);
            }

            const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
            if (match) {
                oldLineNum = parseInt(match[1]) || 0;
                newLineNum = parseInt(match[3]) || 0;
                const oldLines = match[2] !== undefined ? parseInt(match[2]) : 1;
                const newLines = match[4] !== undefined ? parseInt(match[4]) : 1;

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

            const typeChar = line[0];
            let type: 'add' | 'remove' | 'context';
            let content = line;

            if (typeChar === '+') {
                type = 'add';
                content = line.substring(1);
            } else if (typeChar === '-') {
                type = 'remove';
                content = line.substring(1);
            } else if (typeChar === ' ') {
                type = 'context';
                content = line.substring(1);
            } else {
                // Sometimes diffs have no prefix for context if line is completely empty, 
                // but normally git prepends a space. If it doesn't match standard prefixes, 
                // treat as context without stripping first char, or strip if we know it's strict format.
                // Git porcelein normally has a space.
                type = 'context';
            }

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

    // Post-process to calculate word-level diffs
    computeWordDiffs(hunks);

    return { oldContent, newContent, hunks };
}

/**
 * Iterates through hunks to find adjacent removed and added lines
 * and computes intra-line word diffs using the 'diff' library.
 */
function computeWordDiffs(hunks: DiffHunk[]) {
    for (const hunk of hunks) {
        let removeIndices: number[] = [];
        let addIndices: number[] = [];

        // Simple heuristic: if we have block of removes followed by block of adds,
        // and they are the same length, we diff them line by line.
        // A more advanced heuristic would join the blocks and diff the whole text.
        // For now, let's look for 1-to-1 replacements.
        for (let i = 0; i < hunk.lines.length; i++) {
            const line = hunk.lines[i];
            if (line.type === 'remove') {
                removeIndices.push(i);
            } else if (line.type === 'add') {
                addIndices.push(i);
            } else if (line.type === 'context') {
                // Resolve current block
                applyWordDiff(hunk.lines, removeIndices, addIndices);
                removeIndices = [];
                addIndices = [];
            }
        }
        // Final block
        applyWordDiff(hunk.lines, removeIndices, addIndices);
    }
}

function applyWordDiff(lines: DiffLine[], removes: number[], adds: number[]) {
    // Only apply if it's a 1-to-1 line replacement or similar simple correlation to avoid mess.
    // A robust approach is to join all removes and all adds, but then assigning back to lines is tricky.
    // We'll do line-by-line if lengths match.
    if (removes.length > 0 && removes.length === adds.length) {
        for (let i = 0; i < removes.length; i++) {
            const rmLine = lines[removes[i]];
            const adLine = lines[adds[i]];

            const changes = diffWordsWithSpace(rmLine.content, adLine.content);

            // Store the changes in both lines to be rendered
            rmLine.wordDiff = changes;
            adLine.wordDiff = changes;
        }
    }
}

/**
 * Generates a patch to stage/unstage selected portions of a file.
 */
export function generatePatch(filePath: string, hunks: DiffHunk[], selectedLines: Set<string>): string {
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

            const currentDrift = (newLinesCount - oldLinesCount) - (hunk.newLines - hunk.oldLines);
            accumulatedDrift += currentDrift;
        } else {
            const currentDrift = -(hunk.newLines - hunk.oldLines);
            accumulatedDrift += currentDrift;
        }
    }

    return patch;
}
