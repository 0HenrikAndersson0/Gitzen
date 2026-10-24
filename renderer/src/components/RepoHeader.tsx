import { GitBranch, FolderGit, ChevronDown, Plus, FolderOpen, Settings, ArrowUp, ArrowDown, UploadCloud, DownloadCloud, RefreshCw, Trash2, Archive, BarChart2, Filter, Terminal, Sparkles, Search, Check } from 'lucide-react';
import { Badge } from './ui/badge';
import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';

interface RepoHeaderProps {
  repoName: string | null;
  currentRepoPath?: string | null;
  currentBranch: string;
  hasCredentials: boolean;
  branchStatus?: {
    ahead: number;
    behind: number;
    hasUpstream: boolean;
  };
  isDisabled?: boolean;
  canStash?: boolean;
  isShowingGraphs?: boolean;
  isShowingFilters?: boolean;
  superprojectPath?: string | null;
  onOpenSuperproject?: (path: string) => void;
  onSwitchRepo?: (repoName: string, path: string) => void;
  onOpenNew?: () => void;
  onOpenSettings?: () => void;
  onPush?: () => void;
  onPull?: () => void;
  onFetch?: () => void;
  onStash?: () => void;
  onToggleGraphs?: () => void;
  onToggleFilters?: () => void;
  onToggleAgentSession?: () => void;
  onStartGitFlow?: () => void;
  isShowingAgentSession?: boolean;
}

export const RepoHeader = memo(function RepoHeader({ repoName, currentRepoPath, currentBranch, hasCredentials, branchStatus, isDisabled, canStash, isShowingGraphs, isShowingFilters, isShowingAgentSession, superprojectPath, onOpenSuperproject, onSwitchRepo, onOpenNew, onOpenSettings, onPush, onPull, onFetch, onStash, onToggleGraphs, onToggleFilters, onToggleAgentSession, onStartGitFlow }: RepoHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [recentRepos, setRecentRepos] = useState<Array<{ name: string; path: string }>>([]);
  const [repoFilter, setRepoFilter] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isCurrentRepo = (path: string) =>
    !!(currentRepoPath &&
      path.replace(/\\/g, '/').replace(/[/\\]+$/, '').toLowerCase() ===
      currentRepoPath.replace(/\\/g, '/').replace(/[/\\]+$/, '').toLowerCase());

  const filteredRepos = recentRepos.filter(repo =>
    !repoFilter ||
    repo.name.toLowerCase().includes(repoFilter.toLowerCase()) ||
    repo.path.toLowerCase().includes(repoFilter.toLowerCase())
  );

  const loadRecent = useCallback(async () => {
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
  }, []);

  // Load recent repos from IPC
  useEffect(() => {
    loadRecent();
  }, [repoName, loadRecent]); // Reload when repo changes

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

  const handleToggleDropdown = () => {
    if (!isDisabled) {
      // Always re-read recents when opening the dropdown so entries
      // added elsewhere (e.g. by the folder scan) are visible
      if (!isOpen) {
        loadRecent();
        setRepoFilter('');
      }
      setIsOpen(!isOpen);
    }
  };

  const handleRemoveRecent = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    try {
      await window.electronAPI.removeRecentRepo(path);
      await loadRecent();
    } catch (error) {
      console.error('Failed to remove recent repo:', error);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-secondary p-3">
            <FolderGit className="size-8 text-foreground" />
          </div>
          <div>
            {repoName ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  id="tour-repo-selector"
                  onClick={handleToggleDropdown}
                  disabled={isDisabled}
                  className={`group flex items-center gap-2 text-left transition-colors ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:text-foreground'}`}
                >
                  <h1 className="mb-0.5">{repoName}</h1>
                  <ChevronDown className="size-4 text-muted-foreground transition-transform group-hover:text-foreground" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </button>

                {isOpen && (
                  <div className="absolute left-0 top-full z-50 mt-2 min-w-[280px] rounded-lg border border-border bg-card shadow-xl">
                    {/* Open New Repository Option */}
                    <button
                      onClick={handleOpenNew}
                      className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent"
                    >
                      <Plus className="size-4 text-emerald-400" />
                      <div>
                        <div className="text-sm font-medium text-foreground">Open New Repository</div>
                        <div className="text-xs text-muted-foreground">Clone or open another repo</div>
                      </div>
                    </button>

                    {/* Repository List */}
                    {recentRepos.length > 0 && (
                      <div className="p-2">
                        <div className="flex items-center justify-between px-2 py-1 text-xs font-medium text-muted-foreground">
                          <span>Recent Repositories</span>
                          <span>{repoFilter ? `${filteredRepos.length} / ${recentRepos.length}` : recentRepos.length}</span>
                        </div>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                          <Input
                            value={repoFilter}
                            onChange={(e) => setRepoFilter(e.target.value)}
                            placeholder="Filter repositories..."
                            className="h-8 pl-7 text-xs bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground"
                            autoFocus
                          />
                        </div>
                        {filteredRepos.length === 0 ? (
                          <div className="py-4 text-center text-xs text-muted-foreground">
                            No repositories match "{repoFilter}"
                          </div>
                        ) : (
                          <div className="mt-1 max-h-[320px] overflow-y-auto">
                            {filteredRepos.map((repo, index) => {
                              const isCurrent = isCurrentRepo(repo.path);
                              return (
                                <div
                                  key={index}
                                  className={`group/item flex w-full items-center gap-2 rounded-md px-3 py-2 transition-colors cursor-pointer ${isCurrent ? 'bg-info/10 hover:bg-info/15' : 'hover:bg-accent'}`}
                                  onClick={() => handleSwitchRepo(repo.name, repo.path)}
                                >
                                  <FolderOpen className={`size-4 flex-shrink-0 ${isCurrent ? 'text-info' : 'text-foreground'}`} />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`truncate text-sm font-medium ${isCurrent ? 'text-info' : 'text-foreground'}`}>
                                        {repo.name}
                                      </span>
                                      {isCurrent && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-info/15 text-info flex-shrink-0">Current</span>
                                      )}
                                    </div>
                                    <div className="truncate text-xs text-muted-foreground" title={repo.path}>
                                      {repo.path}
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => handleRemoveRecent(e, repo.path)}
                                    className="opacity-0 group-hover/item:opacity-100 p-1 hover:bg-muted rounded transition-all flex-shrink-0"
                                    title="Remove from recent list"
                                  >
                                    <Trash2 className="size-3.5 text-muted-foreground hover:text-red-400" />
                                  </button>
                                  {isCurrent && (
                                    <Check className="size-3.5 text-info flex-shrink-0" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {repoName && (
                  <div className="flex flex-col gap-1.5 mt-1.5">
                    {superprojectPath && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] h-4 px-1.5 font-medium leading-none">Submodule</Badge>
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenSuperproject?.(superprojectPath); }}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors hover:underline"
                          title="Return to Parent Repository"
                        >
                           <ArrowUp className="size-3" />
                           Back to parent repo
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <GitBranch className="size-4" />
                      <span>{currentBranch}</span>
                      {branchStatus && branchStatus.hasUpstream && (
                        <div className="flex items-center gap-2 ml-2 text-xs">
                          <span className={`flex items-center ${branchStatus.behind > 0 ? 'text-foreground' : 'text-muted-foreground'}`} title={`${branchStatus.behind} commits behind`}>
                            <ArrowDown className="size-3 mr-0.5" />
                            {branchStatus.behind}
                          </span>
                          <span className={`flex items-center ${branchStatus.ahead > 0 ? 'text-foreground' : 'text-muted-foreground'}`} title={`${branchStatus.ahead} commits ahead`}>
                            <ArrowUp className="size-3 mr-0.5" />
                            {branchStatus.ahead}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <h1 className="mb-1">No Repository</h1>
            )}
          </div>
        </div>

        <div className="flex gap-2 items-center">
          {repoName && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const result = await window.electronAPI.openTerminal();
                  if (!result.success) {
                    toast.error(result.error || 'Failed to open terminal');
                  }
                }}
                className="gap-2 border-border bg-secondary/50 hover:bg-accent text-foreground transition-colors"
                title="Open in Terminal"
              >
                <Terminal className="size-4" />
                <span className="hidden sm:inline">Terminal</span>
              </Button>
              <Button
                id="tour-agent-button"
                variant="outline"
                size="sm"
                onClick={onToggleAgentSession}
                className={`gap-2 border-border transition-colors ${isShowingAgentSession ? 'bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30' : 'bg-secondary/50 hover:bg-accent text-foreground'}`}
                title="Toggle Agent Sessions"
              >
                <Sparkles className="size-4" />
                <span className="hidden sm:inline">Agent</span>
              </Button>
              {onStartGitFlow && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onStartGitFlow}
                  className="gap-2 border-border bg-secondary/50 hover:bg-accent text-foreground transition-colors"
                  title="Start Git Flow Branch"
                >
                  <GitBranch className="size-4" />
                  <span className="hidden sm:inline">Flow</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleGraphs}
                className={`gap-2 border-border transition-colors ${isShowingGraphs ? 'bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30' : 'bg-secondary/50 hover:bg-accent text-foreground'}`}
                title="View repository graphs"
              >
                <BarChart2 className="size-4" />
                <span className="hidden sm:inline">Graphs</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleFilters}
                className={`gap-2 border-border transition-colors ${isShowingFilters ? 'bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30' : 'bg-secondary/50 hover:bg-accent text-foreground'}`}
                title="Toggle History Filters"
              >
                <Filter className="size-4" />
                <span className="hidden sm:inline">Filters</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onStash}
                disabled={!canStash}
                className={`gap-2 border-border bg-secondary/50 hover:bg-accent text-foreground ${!canStash ? 'opacity-50' : ''}`}
                title="Stash changes"
              >
                <Archive className="size-4" />
                <span className="hidden sm:inline">Stash</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onFetch}
                className="gap-2 border-border bg-secondary/50 hover:bg-accent text-foreground"
                title="Fetch from all remotes"
              >
                <RefreshCw className="size-4" />
                <span className="hidden sm:inline">Fetch</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onPull}
                className="gap-2 border-border bg-secondary/50 hover:bg-accent text-foreground"
                title="Pull from remote"
              >
                <DownloadCloud className="size-4" />
                <span className="hidden sm:inline">Pull</span>
                {branchStatus && branchStatus.behind > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px] bg-secondary text-secondary-foreground border-none">
                    {branchStatus.behind}
                  </Badge>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onPush}
                className="gap-2 border-border bg-secondary/50 hover:bg-accent text-foreground"
                title="Push to remote"
              >
                <UploadCloud className="size-4" />
                <span className="hidden sm:inline">Push</span>
                {branchStatus && branchStatus.ahead > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px] bg-secondary text-secondary-foreground border-none">
                    {branchStatus.ahead}
                  </Badge>
                )}
              </Button>
            </>
          )}

          <button
            id="tour-settings"
            onClick={() => onOpenSettings?.()}
            className="p-2 rounded-lg bg-secondary/50 hover:bg-accent border border-border transition-colors"
            title="Settings"
          >
            <Settings className="size-4 text-muted-foreground hover:text-foreground" />
          </button>
          {hasCredentials ? (
            <Badge className="bg-success/20 text-success border-success/30 cursor-help" title="Gitzen uses your system's git credentials (e.g. SSH keys, GCM, keychain).">
              Authenticated
            </Badge>
          ) : (
            <Badge className="bg-red-600/10 text-red-400 border-red-600/20 cursor-help" title="Authentication failed. Gitzen relies on your system's git credentials. Please use 'gh auth login' or configure your credential helper.">
              No Credentials
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
});
