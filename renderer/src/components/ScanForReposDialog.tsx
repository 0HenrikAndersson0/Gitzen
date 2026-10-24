import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { FolderSearch, FolderOpen, FolderGit, FolderSymlink, Search, CheckSquare, Square, LoaderCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';

interface ScannedRepo {
  path: string;
  name: string;
  isWorktree: boolean;
}

interface ScanForReposDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (repos: ScannedRepo[]) => Promise<boolean>;
}

const normalizePath = (p: string) => p.replace(/\\/g, '/').replace(/[/\\]+$/, '').toLowerCase();

export function ScanForReposDialog({ open, onOpenChange, onConfirm }: ScanForReposDialogProps) {
  const [phase, setPhase] = useState<'pick' | 'scanning' | 'results'>('pick');
  const [rootFolder, setRootFolder] = useState<string | null>(null);
  const [repos, setRepos] = useState<ScannedRepo[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [alreadyAdded, setAlreadyAdded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPhase('pick');
      setRootFolder(null);
      setRepos([]);
      setChecked(new Set());
      setAlreadyAdded(new Set());
      setFilter('');
      setSubmitting(false);
    }
  }, [open]);

  const isAlreadyAdded = (path: string) => alreadyAdded.has(normalizePath(path));

  const loadAlreadyAdded = async (): Promise<Set<string>> => {
    try {
      const result = await window.electronAPI.getRecentRepos();
      if (result.success && result.repos) {
        const normalized = new Set(result.repos.map(r => normalizePath(r.path)));
        setAlreadyAdded(normalized);
        return normalized;
      }
    } catch (error) {
      console.error('Failed to load recent repos:', error);
    }
    return new Set();
  };

  const pickAndScan = async () => {
    try {
      const result = await window.electronAPI.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select a Folder to Scan for Git Repositories',
      });
      if (!result.success || !result.path) return;

      setRootFolder(result.path);
      setPhase('scanning');
      const [scanResult, addedSet] = await Promise.all([
        window.electronAPI.scanDirectoryForRepos(result.path),
        loadAlreadyAdded()
      ]);
      if (scanResult.success && scanResult.repos) {
        setRepos(scanResult.repos);
        // Pre-select everything found that is not already in recents
        setChecked(new Set(
          scanResult.repos
            .filter(r => !addedSet.has(normalizePath(r.path)))
            .map(r => r.path)
        ));
        setPhase('results');
      } else {
        toast.error(scanResult.error || 'Failed to scan folder');
        setPhase('pick');
      }
    } catch (error) {
      console.error('Failed to scan folder:', error);
      toast.error('Failed to scan folder');
      setPhase('pick');
    }
  };

  const toggleRepo = (path: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const filteredRepos = repos.filter(r =>
    !filter || r.name.toLowerCase().includes(filter.toLowerCase()) || r.path.toLowerCase().includes(filter.toLowerCase())
  );
  const addedCount = repos.filter(r => isAlreadyAdded(r.path)).length;

  const handleConfirm = async () => {
    const selected = repos.filter(r => checked.has(r.path));
    if (selected.length === 0) return;
    setSubmitting(true);
    try {
      const success = await onConfirm(selected);
      if (success) {
        onOpenChange(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <FolderSearch className="size-5" />
            Scan Folder for Repositories
          </DialogTitle>
          {phase === 'pick' ? (
            <DialogDescription className="text-muted-foreground">
              Choose a folder such as your projects directory. Gitzen searches it (up to 3 levels deep) for git repositories.
            </DialogDescription>
          ) : (
            <DialogDescription className="text-muted-foreground truncate" title={rootFolder || undefined}>
              {rootFolder}
            </DialogDescription>
          )}
        </DialogHeader>

        {phase === 'pick' && (
          <div className="space-y-4 py-2">
            <Button
              onClick={pickAndScan}
              className="w-full justify-start bg-secondary/50 hover:bg-accent border-border text-foreground"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-muted-foreground" />
                  <span className="text-muted-foreground">Choose a folder to scan...</span>
                </div>
                <FolderSearch className="h-5 w-5 text-muted-foreground" />
              </div>
            </Button>
          </div>
        )}

        {phase === 'scanning' && (
          <div className="py-10 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <LoaderCircle className="size-8 animate-spin" />
            <p className="text-sm">Scanning for git repositories...</p>
          </div>
        )}

        {phase === 'results' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-foreground">
                {repos.length === 0 ? (
                  'No git repositories found'
                ) : (
                  <>
                    Found <span className="font-semibold">{repos.length}</span> {repos.length === 1 ? 'repository' : 'repositories'}
                    {addedCount > 0 && (
                      <span className="text-muted-foreground"> · {addedCount} already added</span>
                    )}
                  </>
                )}
              </div>
              {repos.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setChecked(new Set(repos.filter(r => !isAlreadyAdded(r.path)).map(r => r.path)))}
                    className="h-7 text-xs text-foreground hover:bg-muted"
                  >
                    <CheckSquare className="size-3.5 mr-1" />
                    All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setChecked(new Set())}
                    className="h-7 text-xs text-foreground hover:bg-muted"
                  >
                    <Square className="size-3.5 mr-1" />
                    None
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={pickAndScan}
                    className="h-7 text-xs text-foreground hover:bg-muted"
                  >
                    <FolderOpen className="size-3.5 mr-1" />
                    Rescan
                  </Button>
                </div>
              )}
            </div>

            {repos.length > 0 && (
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter repositories..."
                  className="h-8 pl-7 text-xs bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>
            )}

            <div className="max-h-[320px] overflow-y-auto rounded-md border border-border">
              {repos.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No git repositories found in this folder.
                  <br />
                  Try a different folder or a deeper scan.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredRepos.map((repo) => {
                    const already = isAlreadyAdded(repo.path);
                    return (
                      <div
                        key={repo.path}
                        onClick={() => { if (!already) toggleRepo(repo.path); }}
                        className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${already ? 'cursor-not-allowed opacity-60 hover:bg-transparent' : 'cursor-pointer hover:bg-accent/50'}`}
                        title={already ? 'This repository is already in your recent repositories' : undefined}
                      >
                        <Checkbox
                          checked={checked.has(repo.path)}
                          disabled={already}
                          onCheckedChange={() => { if (!already) toggleRepo(repo.path); }}
                          className="flex-shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {repo.isWorktree ? (
                              <FolderSymlink className="size-3.5 flex-shrink-0 text-muted-foreground" />
                            ) : (
                              <FolderGit className="size-3.5 flex-shrink-0 text-muted-foreground" />
                            )}
                            <span className="truncate text-sm font-medium text-foreground">{repo.name}</span>
                            {repo.isWorktree && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary/50 text-muted-foreground flex-shrink-0">worktree</span>
                            )}
                            {already && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-info/15 text-info flex-shrink-0">
                                Already added
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground" title={repo.path}>{repo.path}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="bg-secondary border-border text-foreground hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={checked.size === 0 || submitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {submitting
                  ? 'Adding...'
                  : `Add ${checked.size} ${checked.size === 1 ? 'repository' : 'repositories'} to Recents`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}