import { useState, useEffect } from 'react';
import { Settings, FolderOpen, User, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [mergeToolPath, setMergeToolPath] = useState('');
  const [maxCommits, setMaxCommits] = useState(30);
  const [gitName, setGitName] = useState('');
  const [gitEmail, setGitEmail] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [isGlobalConfig, setIsGlobalConfig] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [mergeToolResult, maxCommitsResult, gitUserResult, remoteResult] = await Promise.all([
        window.electronAPI.getMergeToolPath(),
        window.electronAPI.getMaxCommits(),
        window.electronAPI.getGitUserConfig(),
        window.electronAPI.getRemoteUrl('origin'),
      ]);
      if (mergeToolResult.success) {
        setMergeToolPath(mergeToolResult.mergeToolPath || '');
      }
      if (maxCommitsResult.success) {
        setMaxCommits(maxCommitsResult.maxCommits || 30);
      }
      if (gitUserResult.success) {
        setGitName(gitUserResult.name || '');
        setGitEmail(gitUserResult.email || '');
        setIsGlobalConfig(gitUserResult.isGlobal !== false);
      }
      if (remoteResult.success) {
        setRemoteUrl(remoteResult.url || '');
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBrowse = async () => {
    try {
      // Note: We'll need to add a file picker dialog for executables
      // For now, we'll use a simple input. In a real implementation,
      // you'd want to use dialog.showOpenDialog with filters for executables
      const result = await window.electronAPI.showOpenDialog({
        properties: ['openFile'],
        title: 'Select Merge Tool Executable',
      });
      if (result.success && result.path) {
        setMergeToolPath(result.path);
      }
    } catch (error) {
      console.error('Failed to browse for merge tool:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const [mergeToolResult, maxCommitsResult, gitUserResult, remoteResult] = await Promise.all([
        window.electronAPI.setMergeToolPath(mergeToolPath),
        window.electronAPI.setMaxCommits(maxCommits),
        window.electronAPI.setGitUserConfig(gitName, gitEmail, isGlobalConfig),
        remoteUrl ? window.electronAPI.setRemoteUrl('origin', remoteUrl) : Promise.resolve({ success: true }),
      ]);

      const errors: string[] = [];
      if (!mergeToolResult.success) errors.push(`Merge Tool: ${mergeToolResult.error}`);
      if (!maxCommitsResult.success) errors.push(`Max Commits: ${maxCommitsResult.error}`);
      if (!gitUserResult.success) errors.push(`Git User: ${gitUserResult.error}`);
      if (!remoteResult.success) errors.push(`Remote URL: ${remoteResult.error}`);

      if (errors.length === 0) {
        toast.success('Settings saved successfully');
        onClose();
      } else {
        console.error('Failed to save settings:', errors.join(', '));
        toast.error(`Failed to save: ${errors[0]}`); // Show first error
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('An unexpected error occurred while saving settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="bg-card border-border max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Settings className="size-5 text-blue-400" />
            <DialogTitle>Settings</DialogTitle>
          </div>
          <DialogDescription>
            Configure your Git identity, remotes, and preferences.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4 max-h-[60vh] overflow-y-auto pr-2">
          <div className="space-y-4 border-b border-border pb-6">
            <div className="flex items-center gap-2 mb-2">
              <User className="size-4 text-blue-400" />
              <h3 className="text-sm font-medium text-foreground">Git Identity</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gitName">User Name</Label>
                <Input
                  id="gitName"
                  type="text"
                  placeholder="John Doe"
                  value={gitName}
                  onChange={(e) => setGitName(e.target.value)}
                  className="bg-background border-border"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gitEmail">User Email</Label>
                <Input
                  id="gitEmail"
                  type="email"
                  placeholder="john@example.com"
                  value={gitEmail}
                  onChange={(e) => setGitEmail(e.target.value)}
                  className="bg-background border-border"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="isGlobal"
                checked={isGlobalConfig}
                onCheckedChange={(checked) => setIsGlobalConfig(!!checked)}
                disabled={loading}
              />
              <label
                htmlFor="isGlobal"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-muted-foreground"
              >
                Save as global configuration
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              This will update your user.name and user.email in your Git configuration.
            </p>
          </div>

          <div className="space-y-4 border-b border-border pb-6">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="size-4 text-blue-400" />
              <h3 className="text-sm font-medium text-foreground">Remote</h3>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="remoteUrl">Remote URL (origin)</Label>
              <Input
                id="remoteUrl"
                type="text"
                placeholder="https://github.com/username/repo.git"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                className="bg-background border-border font-mono text-xs"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                The URL for the 'origin' remote. Change this to update where you push/pull from.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mergeToolPath">Merge Tool Path</Label>
            <div className="flex gap-2">
              <Input
                id="mergeToolPath"
                type="text"
                placeholder="/usr/bin/meld or C:\\Program Files\\Meld\\meld.exe"
                value={mergeToolPath}
                onChange={(e) => setMergeToolPath(e.target.value)}
                className="bg-background border-border flex-1"
                disabled={loading}
              />
              <Button
                onClick={handleBrowse}
                variant="outline"
                className="bg-secondary border-border hover:bg-muted"
                disabled={loading}
              >
                <FolderOpen className="size-4 mr-2" />
                Browse
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Path to your preferred merge tool executable. Leave empty to use Git's default mergetool or system default.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="maxCommits">Max Commits in Graph</Label>
            <Input
              id="maxCommits"
              type="number"
              min="10"
              max="200"
              value={maxCommits}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value) && value >= 10 && value <= 200) {
                  setMaxCommits(value);
                }
              }}
              className="bg-background border-border"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of commits to display in the commit graph. Higher values may impact performance. (10-200)
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={onClose}
            variant="outline"
            className="bg-secondary border-border hover:bg-muted"
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700"
            disabled={saving || loading}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

