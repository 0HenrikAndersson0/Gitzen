import { useState, useEffect } from 'react';
import { FolderOpen, Clock, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';

interface OpenRepoProps {
  onOpen: (path: string) => void;
}

interface RecentRepo {
  path: string;
  name: string;
  lastOpened: number;
}

declare global {
  interface Window {
    electronAPI: {
      showOpenDialog: () => Promise<{ success: boolean; path?: string; error?: string }>;
      getRecentRepos: () => Promise<{ success: boolean; repos?: RecentRepo[]; error?: string }>;
      addRecentRepo: (path: string) => Promise<{ success: boolean; error?: string }>;
      gitOpen: (path: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

export function OpenRepo({ onOpen }: OpenRepoProps) {
  const [recentRepos, setRecentRepos] = useState<RecentRepo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load recent repos on mount
  useEffect(() => {
    loadRecentRepos();
  }, []);

  const loadRecentRepos = async () => {
    try {
      const result = await window.electronAPI.getRecentRepos();
      if (result.success && result.repos) {
        setRecentRepos(result.repos);
      }
    } catch (error) {
      console.error('Failed to load recent repos:', error);
    }
  };

  const handleBrowseFolder = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.showOpenDialog();
      if (result.success && result.path) {
        await handleOpenRepository(result.path);
      }
    } catch (error) {
      console.error('Failed to browse folder:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenRepository = async (path: string) => {
    setIsLoading(true);
    try {
      // Validate that it's a git repository
      const result = await window.electronAPI.gitOpen(path);
      if (result.success) {
        // Add to recent repos
        await window.electronAPI.addRecentRepo(path);
        await loadRecentRepos();
        onOpen(path);
      } else {
        // Show error - not a valid git repo
        alert(`Failed to open repository: ${result.error || 'Not a valid Git repository'}`);
      }
    } catch (error) {
      console.error('Failed to open repository:', error);
      alert(`Failed to open repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const formatPath = (path: string) => {
    // Show only the last 2 segments of the path for display
    const parts = path.split(/[/\\]/).filter(Boolean);
    if (parts.length <= 2) return path;
    return `.../${parts.slice(-2).join('/')}`;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'just now';
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
      <div className="mb-6">
        <h2 className="mb-2 flex items-center gap-2 font-semibold text-zinc-100">
          <FolderOpen className="h-5 w-5 text-blue-400" />
          Open Local Repository
        </h2>
        <p className="text-sm text-zinc-400">
          Browse and open an existing Git repository from your local filesystem
        </p>
      </div>

      <div className="space-y-6">
        {/* Folder Browser */}
        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">
            Select Repository Folder
          </label>
          <Button
            onClick={handleBrowseFolder}
            disabled={isLoading}
            className="w-full justify-start bg-zinc-800/50 hover:bg-zinc-800 border-zinc-700 text-zinc-300"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-zinc-400" />
                <span className="text-zinc-400">
                  {isLoading ? 'Opening...' : 'Choose a folder...'}
                </span>
              </div>
              <ChevronRight className="h-5 w-5 text-zinc-500" />
            </div>
          </Button>
        </div>

        {/* Recent Paths */}
        {recentRepos.length > 0 && (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-zinc-500" />
              <label className="text-sm font-medium text-zinc-300">
                Recent Repositories
              </label>
            </div>
            <div className="space-y-2">
              {recentRepos.map((repo, index) => (
                <button
                  key={index}
                  onClick={() => handleOpenRepository(repo.path)}
                  disabled={isLoading}
                  className="group w-full rounded-md border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-left transition-all hover:border-blue-500/50 hover:bg-zinc-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 flex-shrink-0 text-zinc-500 group-hover:text-blue-400" />
                        <span className="truncate text-sm font-medium text-zinc-300 group-hover:text-zinc-100">
                          {repo.name || formatPath(repo.path)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="truncate text-xs text-zinc-500" title={repo.path}>
                          {formatPath(repo.path)}
                        </p>
                        <span className="text-xs text-zinc-600">•</span>
                        <span className="text-xs text-zinc-500">
                          {formatTime(repo.lastOpened)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-zinc-600 transition-transform group-hover:translate-x-1 group-hover:text-blue-400" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {recentRepos.length === 0 && (
          <div className="rounded-md border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-8 text-center">
            <FolderOpen className="mx-auto h-12 w-12 text-zinc-700" />
            <p className="mt-3 text-sm text-zinc-500">
              No recent repositories
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              Open a repository to see it here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

