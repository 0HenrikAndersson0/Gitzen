import { useState } from 'react';
import { GitCommitHorizontal, Upload } from 'lucide-react';
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
  onPush: () => void;
  hasCredentials: boolean;
  unpushedCommitsCount?: number;
  onRevertFile?: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  onStash: (message: string) => void;
}

export function CommitPanel({
  files,
  onToggleStage,
  onCommit,
  onPush,
  hasCredentials,
  unpushedCommitsCount = 0,
  onRevertFile,
  onDeleteFile,
  onStash,
}: CommitPanelProps) {
  const [commitMessage, setCommitMessage] = useState('');
  const [stashMessage, setStashMessage] = useState('');

  const handleCommit = () => {
    if (commitMessage.trim()) {
      onCommit(commitMessage);
      setCommitMessage('');
    }
  };

  const handleStash = () => {
    onStash(stashMessage);
    setStashMessage('');
  };

  const stagedFiles = files.filter((f) => f.staged);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
      <div className="mb-4 flex items-center gap-2">
        <GitCommitHorizontal className="size-5 text-green-400" />
        <h2>Changes</h2>
        <span className="ml-auto text-sm text-zinc-500">
          {stagedFiles.length} staged / {files.length} total
        </span>
      </div>

      <div className="space-y-4">
        <div className="max-h-64 overflow-y-auto">
          <FileStaging 
            files={files} 
            onToggleStage={onToggleStage}
            onRevertFile={onRevertFile}
            onDeleteFile={onDeleteFile}
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
          <Button
            onClick={onPush}
            disabled={!hasCredentials || unpushedCommitsCount === 0 }
            className="flex-1 bg-blue-600 hover:bg-blue-700 relative"
          >
            <Upload className="mr-2 size-4" />
            Push
            {unpushedCommitsCount > 0 && (
              <span className="ml-2 flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-orange-400 text-white text-[10px] font-semibold">
                {unpushedCommitsCount}
              </span>
            )}
          </Button>
        </div>
        <div className="flex gap-2">
          <Textarea
            id="stash-message"
            placeholder="Enter your stash message..."
            value={stashMessage}
            onChange={(e) => setStashMessage(e.target.value)}
            className="min-h-10 bg-zinc-950 border-zinc-700 font-mono resize-none"
          />
          <Button
            onClick={handleStash}
            disabled={files.length === 0}
            className="bg-amber-600 hover:bg-amber-700"
          >
            Stash
          </Button>
        </div>
      </div>
    </div>
  );
}

