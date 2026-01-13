import { useState } from 'react';
import { FolderGit, Download, FolderOpen } from 'lucide-react';
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

  const handleBrowsePath = async () => {
    try {
      const result = await window.electronAPI.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Destination Folder'
      });
      if (result.success && result.path) {
        let selectedPath = result.path;
        
        // Auto-append repo name if available and not already part of path
        if (repoUrl) {
          const repoName = repoUrl.split('/').pop()?.replace('.git', '');
          // Check if selected folder is likely the parent (common use case)
          // If the selected folder name is different from repo name, append repo name
          // This is a heuristic to help users who pick "Projects" folder
          if (repoName && !selectedPath.endsWith(repoName)) {
             // We can check if directory is empty, but we can't do that easily from here without IPC
             // Let's just append if the path doesn't end with it.
             // But if they picked the target folder explicitly? 
             // Let's just set the path and let user edit.
             // Actually, standard behavior for "Clone" is often "Pick Parent".
             // But "Destination Path" usually implies the full path.
             
             // Let's keep it simple: Set path to what was picked.
             // But maybe verify if we should append?
             // If I pick "Projects", I want "Projects/my-repo".
             // If I pick "my-repo" (created empty), I want "my-repo".
             
             // I'll append the repo name if the input was previously empty or just a parent path?
             // Let's just append the repo name if available, as a convenience.
             // User can remove it if they selected the target folder itself.
             // Using correct separator
             const separator = selectedPath.includes('\\') ? '\\' : '/';
             selectedPath = `${selectedPath}${separator}${repoName}`;
          }
        }
        
        setLocalPath(selectedPath);
      }
    } catch (error) {
      console.error('Failed to browse path:', error);
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
          <Label htmlFor="local-path">Destination Path</Label>
          <div className="flex gap-2">
            <Input
              id="local-path"
              type="text"
              placeholder="/Users/username/projects/repository"
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              className="bg-zinc-950 border-zinc-700 flex-1"
            />
            <Button
              variant="outline"
              onClick={handleBrowsePath}
              className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700 px-3"
              title="Browse folder"
            >
              <FolderOpen className="size-4" />
            </Button>
          </div>
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

