import { useState, useEffect } from 'react';
import { Settings, FolderOpen, Key, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [mergeToolPath, setMergeToolPath] = useState('');
  const [maxCommits, setMaxCommits] = useState(30);
  const [credentials, setCredentials] = useState<string[]>([]);
  const [selectedCredential, setSelectedCredential] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingCredential, setDeletingCredential] = useState(false);

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [mergeToolResult, maxCommitsResult, credentialsResult] = await Promise.all([
        window.electronAPI.getMergeToolPath(),
        window.electronAPI.getMaxCommits(),
        window.electronAPI.listCredentials(),
      ]);
      if (mergeToolResult.success) {
        setMergeToolPath(mergeToolResult.mergeToolPath || '');
      }
      if (maxCommitsResult.success) {
        setMaxCommits(maxCommitsResult.maxCommits || 30);
      }
      if (credentialsResult.success) {
        setCredentials(credentialsResult.credentials || []);
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

  const handleDeleteCredential = async () => {
    if (!selectedCredential) return;
    
    setDeletingCredential(true);
    try {
      const result = await window.electronAPI.deleteCredentials(selectedCredential);
      if (result.success) {
        // Refresh list
        const updated = await window.electronAPI.listCredentials();
        if (updated.success) {
          setCredentials(updated.credentials || []);
          setSelectedCredential('');
        }
      } else {
        console.error('Failed to delete credential:', result.error);
      }
    } catch (error) {
      console.error('Failed to delete credential:', error);
    } finally {
      setDeletingCredential(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const [mergeToolResult, maxCommitsResult] = await Promise.all([
        window.electronAPI.setMergeToolPath(mergeToolPath),
        window.electronAPI.setMaxCommits(maxCommits),
      ]);
      if (mergeToolResult.success && maxCommitsResult.success) {
        onClose();
      } else {
        console.error('Failed to save settings:', mergeToolResult.error || maxCommitsResult.error);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Settings className="size-5 text-blue-400" />
            <DialogTitle>Settings</DialogTitle>
          </div>
          <DialogDescription>
            Configure your Git merge tool preferences.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="mergeToolPath">Merge Tool Path</Label>
            <div className="flex gap-2">
              <Input
                id="mergeToolPath"
                type="text"
                placeholder="/usr/bin/meld or C:\\Program Files\\Meld\\meld.exe"
                value={mergeToolPath}
                onChange={(e) => setMergeToolPath(e.target.value)}
                className="bg-zinc-950 border-zinc-700 flex-1"
                disabled={loading}
              />
              <Button
                onClick={handleBrowse}
                variant="outline"
                className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
                disabled={loading}
              >
                <FolderOpen className="size-4 mr-2" />
                Browse
              </Button>
            </div>
            <p className="text-xs text-zinc-500">
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
              className="bg-zinc-950 border-zinc-700"
              disabled={loading}
            />
            <p className="text-xs text-zinc-500">
              Maximum number of commits to display in the commit graph. Higher values may impact performance. (10-200)
            </p>
          </div>

          <div className="space-y-2">
            <Label>Saved Credentials</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Select value={selectedCredential} onValueChange={setSelectedCredential} disabled={loading || credentials.length === 0}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-700 w-full">
                    <SelectValue placeholder={credentials.length === 0 ? "No saved credentials" : "Select a credential to manage"} />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                    {credentials.map((cred) => (
                      <SelectItem key={cred} value={cred} className="hover:bg-zinc-800 focus:bg-zinc-800 cursor-pointer">
                        {cred}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleDeleteCredential}
                variant="destructive"
                className="bg-red-900/50 border-red-900 hover:bg-red-900 text-red-100"
                disabled={!selectedCredential || deletingCredential}
              >
                <Trash2 className="size-4 mr-2" />
                Delete
              </Button>
            </div>
            <p className="text-xs text-zinc-500">
              Manage saved credentials for remote repositories.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={onClose}
            variant="outline"
            className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
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

