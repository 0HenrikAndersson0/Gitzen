import { GitBranch, FolderGit } from 'lucide-react';
import { Badge } from './ui/badge';

interface RepoHeaderProps {
  repoName: string | null;
  currentBranch: string;
  hasCredentials: boolean;
}

export function RepoHeader({ repoName, currentBranch, hasCredentials }: RepoHeaderProps) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-600/10 p-3">
            <FolderGit className="size-8 text-blue-400" />
          </div>
          <div>
            <h1 className="mb-1">
              {repoName || 'No Repository'}
            </h1>
            {repoName && (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <GitBranch className="size-4" />
                <span>{currentBranch}</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex gap-2">
          {hasCredentials ? (
            <Badge className="bg-green-600/10 text-green-400 border-green-600/20">
              Authenticated
            </Badge>
          ) : (
            <Badge className="bg-yellow-600/10 text-yellow-400 border-yellow-600/20">
              No Credentials
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

