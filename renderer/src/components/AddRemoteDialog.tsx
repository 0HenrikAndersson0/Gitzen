import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Checkbox } from './ui/checkbox';
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface AddRemoteDialogProps {
  open: boolean;
  onClose: () => void;
  onAddRemote: (name: string, url: string) => Promise<void>;
}

export function AddRemoteDialog({ open, onClose, onAddRemote }: AddRemoteDialogProps) {
  const [activeTab, setActiveTab] = useState('link');
  const [name, setName] = useState('origin');
  const [url, setUrl] = useState('');
  
  // Create mode state
  const [repoName, setRepoName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [token, setToken] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name && url) {
      onAddRemote(name, url);
      onClose();
    }
  };

  const handleCreate = async () => {
    if (!repoName || !token) return;

    setIsCreating(true);
    try {
      const result = await window.electronAPI.gitCreateGitHubRepo(token, repoName, isPrivate, description);
      if (result.success && result.cloneUrl) {
        toast.success('Repository created on GitHub!');
        
        // Add remote
        await onAddRemote('origin', result.cloneUrl);
        
        // Push code
        toast.info('Pushing code to new repository...');
        const pushResult = await window.electronAPI.gitPush('origin');
        
        if (pushResult.success) {
          toast.success('Code pushed successfully!');
        } else {
          toast.error('Failed to push code: ' + pushResult.error);
        }
        
        onClose();
      } else {
        toast.error(result.error || 'Failed to create repository');
      }
    } catch (error: any) {
      toast.error('Failed to create repository: ' + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] bg-zinc-900 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle>Add Remote</DialogTitle>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-zinc-950 border border-zinc-800">
            <TabsTrigger value="link">Link Existing</TabsTrigger>
            <TabsTrigger value="create">Create on GitHub</TabsTrigger>
          </TabsList>

          <TabsContent value="link">
            <form onSubmit={handleSubmit} className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Remote Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-zinc-950 border-zinc-800"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="url">Remote URL</Label>
                <Input
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="bg-zinc-950 border-zinc-800"
                  placeholder="https://github.com/user/repo.git"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} className="border-zinc-700 hover:bg-zinc-800 text-zinc-300">
                  Cancel
                </Button>
                <Button type="submit" disabled={!name || !url} className="bg-blue-600 hover:bg-blue-700 text-white">
                  Add Remote
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="create">
            <div className="grid gap-4 py-4">
               <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-3 mb-2">
                <p className="text-xs text-blue-300 leading-relaxed">
                  <strong>Instruction:</strong> To create a repository on GitHub, you need a <strong>Personal Access Token (PAT)</strong>. 
                  Generate one at <span className="text-blue-400 underline">github.com/settings/tokens</span> with the <code>repo</code> scope enabled.
                  <br/><span className="text-blue-200/70 mt-1 block">Note: This token is used once for creation and not stored.</span>
                </p>
              </div>
               <div className="grid gap-2">
                <Label htmlFor="token">GitHub Token (PAT)</Label>
                <Input
                  id="token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="bg-zinc-950 border-zinc-800"
                  placeholder="ghp_..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="repoName">Repository Name</Label>
                <Input
                  id="repoName"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  className="bg-zinc-950 border-zinc-800"
                  placeholder="my-awesome-project"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bg-zinc-950 border-zinc-800"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="private" 
                  checked={isPrivate} 
                  onCheckedChange={(checked) => setIsPrivate(checked as boolean)}
                />
                <Label htmlFor="private" className="text-sm font-normal cursor-pointer">
                  Private Repository
                </Label>
              </div>
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} className="border-zinc-700 hover:bg-zinc-800 text-zinc-300">
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreate} 
                  disabled={!repoName || !token || isCreating} 
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create & Link'
                  )}
                </Button>
              </DialogFooter>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}