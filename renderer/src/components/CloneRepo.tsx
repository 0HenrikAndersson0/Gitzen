import { useState } from 'react';
import { FolderGit, Download } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface CloneRepoProps {
  onClone: (url: string, path: string) => void;
}

export function CloneRepo({ onClone }: CloneRepoProps) {
  const [repoUrl, setRepoUrl] = useState('');
  const [localPath, setLocalPath] = useState('');

  const handleClone = () => {
    if (repoUrl && localPath) {
      onClone(repoUrl, localPath);
      setRepoUrl('');
      setLocalPath('');
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
      <div className="mb-4 flex items-center gap-2">
        <FolderGit className="size-5 text-blue-400" />
        <h2>Clone Repository</h2>
      </div>
      
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="repo-url">Repository URL</Label>
          <Input
            id="repo-url"
            type="text"
            placeholder="https://github.com/username/repository.git"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            className="bg-zinc-950 border-zinc-700"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="local-path">Local Path</Label>
          <Input
            id="local-path"
            type="text"
            placeholder="/Users/username/projects/repository"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            className="bg-zinc-950 border-zinc-700"
          />
        </div>

        <Button
          onClick={handleClone}
          disabled={!repoUrl || !localPath}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          <Download className="mr-2 size-4" />
          Clone Repository
        </Button>
      </div>
    </div>
  );
}

