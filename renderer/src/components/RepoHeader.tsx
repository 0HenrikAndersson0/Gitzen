import { GitBranch, FolderGit, ChevronDown, Plus, FolderOpen } from 'lucide-react';
import { Badge } from './ui/badge';
import { useState, useEffect, useRef } from 'react';

interface RepoHeaderProps {
  repoName: string | null;
  currentBranch: string;
  hasCredentials: boolean;
  onSwitchRepo?: (repoName: string, path: string) => void;
  onOpenNew?: () => void;
}

export function RepoHeader({ repoName, currentBranch, hasCredentials, onSwitchRepo, onOpenNew }: RepoHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [recentRepos, setRecentRepos] = useState<Array<{ name: string; path: string }>>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load recent repos from IPC
  useEffect(() => {
    const loadRecent = async () => {
      try {
        const result = await window.electronAPI.getRecentRepos();
        if (result.success && result.repos) {
          setRecentRepos(
            result.repos.map((repo) => ({
              name: repo.name,
              path: repo.path,
            }))
          );
        }
      } catch (error) {
        console.error('Failed to load recent repos:', error);
      }
    };
    loadRecent();
  }, [repoName]); // Reload when repo changes

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleSwitchRepo = (name: string, path: string) => {
    onSwitchRepo?.(name, path);
    setIsOpen(false);
  };

  const handleOpenNew = () => {
    onOpenNew?.();
    setIsOpen(false);
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-600/10 p-3">
            <FolderGit className="size-8 text-blue-400" />
          </div>
          <div>
            {repoName ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsOpen(!isOpen)}
                  className="group flex items-center gap-2 text-left transition-colors hover:text-zinc-100"
                >
                  <h1 className="mb-1">{repoName}</h1>
                  <ChevronDown className="size-4 text-zinc-500 transition-transform group-hover:text-zinc-400" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </button>

                {isOpen && (
                  <div className="absolute left-0 top-full z-50 mt-2 min-w-[280px] rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
                    {/* Open New Repository Option */}
                    <button
                      onClick={handleOpenNew}
                      className="flex w-full items-center gap-3 border-b border-zinc-800 px-4 py-3 text-left transition-colors hover:bg-zinc-800"
                    >
                      <Plus className="size-4 text-emerald-400" />
                      <div>
                        <div className="text-sm font-medium text-zinc-200">Open New Repository</div>
                        <div className="text-xs text-zinc-500">Clone or open another repo</div>
                      </div>
                    </button>

                    {/* Recent Repositories */}
                    {recentRepos.length > 0 && (
                      <div className="p-2">
                        <div className="px-2 py-1 text-xs font-medium text-zinc-500">Recent Repositories</div>
                        {recentRepos.map((repo, index) => (
                          <button
                            key={index}
                            onClick={() => handleSwitchRepo(repo.name, repo.path)}
                            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-zinc-800"
                          >
                            <FolderOpen className="size-4 text-blue-400" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-zinc-300">
                                {repo.name}
                              </div>
                              <div className="truncate text-xs text-zinc-500" title={repo.path}>
                                {repo.path}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {repoName && (
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <GitBranch className="size-4" />
                    <span>{currentBranch}</span>
                  </div>
                )}
              </div>
            ) : (
              <h1 className="mb-1">No Repository</h1>
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
