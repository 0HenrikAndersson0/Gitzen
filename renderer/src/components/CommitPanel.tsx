import React, { forwardRef, useState } from 'react';
import { GitCommitHorizontal, Archive } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { FileStaging } from './FileStaging';

interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted';
  staged: boolean;
}

interface CommitPanelProps {
  files: FileChange[];
  onToggleStage: (path: string) => void;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
  onCommit: (message: string, amend?: boolean) => void;
  onUndoLastCommit?: () => void;
  onRevertFile?: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  onRefresh?: () => void;
  commitMessage: string;
  onCommitMessageChange: (message: string) => void;
  selectedFileIndex?: number;
}

export const CommitPanel = forwardRef<HTMLTextAreaElement, CommitPanelProps>(({
  files,
  onToggleStage,
  onStageAll,
  onUnstageAll,
  onCommit,
  onUndoLastCommit,
  onRevertFile,
  onDeleteFile,
  onRefresh,
  commitMessage,
  onCommitMessageChange,
  selectedFileIndex,
}, ref) => {
  const [amend, setAmend] = useState(false);

  const handleCommit = () => {
    if (commitMessage.trim()) {
      onCommit(commitMessage, amend);
      if (amend) {
        setAmend(false);
      }
    }
  };

  const stagedFiles = files.filter((f) => f.staged);
  const unstagedFiles = files.filter((f) => !f.staged);

  return (
    <div className="rounded-lg border border-border bg-card/50 p-6 flex flex-col h-full">
      <div className="mb-4 flex items-center gap-2 flex-none">
        <GitCommitHorizontal className="size-5 text-foreground" />
        <h2 className="font-semibold">Changes</h2>
      </div>

      <div className="flex-1 flex flex-col gap-4 min-h-0">
        <div className="flex-1 overflow-y-auto min-h-0 border border-border/50 rounded-md">
          <FileStaging
            files={files}
            onToggleStage={onToggleStage}
            onRevertFile={onRevertFile}
            onDeleteFile={onDeleteFile}
            onRefresh={onRefresh}
            selectedFileIndex={selectedFileIndex}
          />
          {files.length > 0 && (
            <div className="p-3 border-t border-border/50 flex gap-4">
              {unstagedFiles.length > 0 && (
                <button
                  onClick={onStageAll}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  Stage All
                </button>
              )}
              {stagedFiles.length > 0 && (
                <button
                  onClick={onUnstageAll}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  Unstage All
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2 flex-none">
          <Label htmlFor="commit-message">Commit Message</Label>
          <Textarea
            ref={ref}
            id="commit-message"
            placeholder="Enter your commit message..."
            value={commitMessage}
            onChange={(e) => onCommitMessageChange(e.target.value)}
            className="h-20 bg-background border-border font-mono resize-none"
          />
        </div>

        <div className="flex flex-col gap-2 flex-none">
          <div className="flex items-center gap-2 mb-1">
            <input
              type="checkbox"
              id="amend-commit"
              checked={amend}
              onChange={(e) => setAmend(e.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary h-3 w-3"
            />
            <label htmlFor="amend-commit" className="text-xs text-muted-foreground select-none">
              Amend previous commit
            </label>
            <div className="flex-1"></div>
            {onUndoLastCommit && (
              <button
                onClick={onUndoLastCommit}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                title="Undo last commit (soft reset)"
              >
                Undo Last Commit
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleCommit}
              disabled={(stagedFiles.length === 0 && !amend) || !commitMessage.trim()}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <GitCommitHorizontal className="mr-2 size-4" />
              {amend ? 'Amend Commit' : 'Commit'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});

CommitPanel.displayName = 'CommitPanel';
