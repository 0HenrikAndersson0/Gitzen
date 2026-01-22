import { useState } from 'react';
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
}

export function CommitPanel({
  files,
  onToggleStage,
  onCommit,
  onRevertFile,
  onDeleteFile,
  onRefresh,
}: CommitPanelProps) {
  const [commitMessage, setCommitMessage] = useState('');

  const handleCommit = () => {
    if (commitMessage.trim()) {
      onCommit(commitMessage);
      setCommitMessage('');
    }
  };

  const stagedFiles = files.filter((f) => f.staged);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
      <div className="mb-4 flex items-center gap-2">
        <GitCommitHorizontal className="size-5 text-green-400" />
        <h2>Changes</h2>
      </div>

      <div className="space-y-4">
        <div className="max-h-64 overflow-y-auto">
          <FileStaging
            files={files}
            onToggleStage={onToggleStage}
            onRevertFile={onRevertFile}
            onDeleteFile={onDeleteFile}
            onRefresh={onRefresh}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="commit-message">Commit Message</Label>
          <Textarea
            id="commit-message"
            placeholder="Enter your commit message..."
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            className="min-h-24 bg-zinc-950 border-zinc-700 font-mono resize-none"
          />
        </div>

        <div className="flex gap-2">
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
}

