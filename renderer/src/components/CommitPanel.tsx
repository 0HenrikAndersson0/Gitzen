import { forwardRef, useState, useEffect } from 'react';
import { GitCommitHorizontal, RotateCcw } from 'lucide-react';
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
  onGenerateCommitMessage?: () => void;
  onRevertFile?: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  onRefresh?: () => void;
  commitMessage: string;
  onCommitMessageChange: (message: string) => void;
  selectedFileIndex?: number;
  onUndoCommit?: () => void;
  lastCommitMessage?: string;
  hasCommits?: boolean;
}

export const CommitPanel = forwardRef<HTMLTextAreaElement, CommitPanelProps>(({
  files,
  onToggleStage,
  onStageAll,
  onUnstageAll,
  onCommit,
  onGenerateCommitMessage,
  onRevertFile,
  onDeleteFile,
  onRefresh,
  commitMessage,
  onCommitMessageChange,
  selectedFileIndex,
  onUndoCommit,
  lastCommitMessage,
  hasCommits,
}, ref) => {
  const [isAmending, setIsAmending] = useState(false);

  useEffect(() => {
    if (isAmending && lastCommitMessage && !commitMessage.trim()) {
      onCommitMessageChange(lastCommitMessage);
    }
  }, [isAmending, lastCommitMessage, commitMessage, onCommitMessageChange]);

  const handleCommit = () => {
    if (commitMessage.trim()) {
      onCommit(commitMessage, isAmending);
      setIsAmending(false);
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
          <div className="flex items-center justify-between">
            <Label htmlFor="commit-message">Commit Message</Label>
            {onGenerateCommitMessage && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onGenerateCommitMessage();
                }}
                className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1 font-medium"
              >
                <span>✨ Auto-generate</span>
              </button>
            )}
          </div>
          <Textarea
            ref={ref}
            id="commit-message"
            placeholder="Enter your commit message..."
            value={commitMessage}
            onChange={(e) => onCommitMessageChange(e.target.value)}
            className="h-20 bg-background border-border font-mono resize-none"
          />
        </div>

        <div className="flex gap-2 flex-none items-center">
          <div className="flex items-center space-x-2">
            <input 
              type="checkbox" 
              id="amend-commit" 
              checked={isAmending} 
              onChange={(e) => setIsAmending(e.target.checked)} 
              disabled={!hasCommits} 
              className="rounded border-border text-primary focus:ring-primary bg-background w-4 h-4 cursor-pointer" 
            />
            <label htmlFor="amend-commit" className={`text-sm cursor-pointer transition-opacity ${hasCommits ? 'opacity-80 hover:opacity-100' : 'opacity-40'}`}>
              Amend previous commit
            </label>
          </div>
        </div>

        <div className="flex gap-2 flex-none mt-1">
          {onUndoCommit && hasCommits && (
            <Button
              onClick={onUndoCommit}
              variant="outline"
              title="Undo Last Commit"
              className="flex-none px-3 border-border hover:bg-secondary text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-4" />
            </Button>
          )}
          <Button
            onClick={handleCommit}
            disabled={(stagedFiles.length === 0 && !isAmending) || !commitMessage.trim()}
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
          >
            <GitCommitHorizontal className="mr-2 size-4" />
            {isAmending ? 'Amend Commit' : 'Commit'}
          </Button>
        </div>
      </div>
    </div>
  );
});

CommitPanel.displayName = 'CommitPanel';
