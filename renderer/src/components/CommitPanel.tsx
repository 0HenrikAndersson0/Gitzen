import { forwardRef } from 'react';
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
  onCommit: (message: string) => void;
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
  onCommit,
  onRevertFile,
  onDeleteFile,
  onRefresh,
  commitMessage,
  onCommitMessageChange,
  selectedFileIndex,
}, ref) => {

  const handleCommit = () => {
    if (commitMessage.trim()) {
      onCommit(commitMessage);
    }
  };

  const stagedFiles = files.filter((f) => f.staged);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 flex flex-col">
      <div className="mb-4 flex items-center gap-2 flex-none">
        <GitCommitHorizontal className="size-5 text-green-400" />
        <h2 className="font-semibold">Changes</h2>
      </div>

      <div className="flex-1 flex flex-col gap-4 min-h-0">
        <div className="flex-1 overflow-y-auto min-h-0 border border-zinc-800/50 rounded-md">
          <FileStaging
            files={files}
            onToggleStage={onToggleStage}
            onRevertFile={onRevertFile}
            onDeleteFile={onDeleteFile}
            onRefresh={onRefresh}
            selectedFileIndex={selectedFileIndex}
          />
        </div>

        <div className="space-y-2 flex-none">
          <Label htmlFor="commit-message">Commit Message</Label>
          <Textarea
            ref={ref}
            id="commit-message"
            placeholder="Enter your commit message..."
            value={commitMessage}
            onChange={(e) => onCommitMessageChange(e.target.value)}
            className="h-20 bg-zinc-950 border-zinc-700 font-mono resize-none"
          />
        </div>

        <div className="flex gap-2 flex-none">
          <Button
            onClick={handleCommit}
            disabled={stagedFiles.length === 0 || !commitMessage.trim()}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            <GitCommitHorizontal className="mr-2 size-4" />
            Commit
          </Button>
        </div>
      </div>
    </div>
  );
});

CommitPanel.displayName = 'CommitPanel';
