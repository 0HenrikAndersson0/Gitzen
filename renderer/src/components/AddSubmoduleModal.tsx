import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

interface AddSubmoduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (url: string, path: string, applyConfigs: boolean) => void;
}

export function AddSubmoduleModal({ open, onOpenChange, onAdd }: AddSubmoduleModalProps) {
  const [url, setUrl] = useState('');
  const [path, setPath] = useState('');
  const [applyConfigs, setApplyConfigs] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    
    // Auto infer path from URL if empty (e.g., https://github.com/user/repo => repo)
    let finalPath = path.trim();
    if (!finalPath) {
      finalPath = url.split('/').pop()?.replace('.git', '') || 'submodule';
    }

    onAdd(url.trim(), finalPath, applyConfigs);
    onOpenChange(false);
    setUrl('');
    setPath('');
    setApplyConfigs(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Submodule</DialogTitle>
          <DialogDescription>
            Clones and registers an external repository inside your current project.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="sm-url" className="text-sm font-medium">
              Repository URL <span className="text-red-500">*</span>
            </label>
            <input
              id="sm-url"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="https://github.com/user/repo.git"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="sm-path" className="text-sm font-medium">
              Target Folder Path <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            <input
              id="sm-path"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="e.g. src/libs/repo"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
          </div>
          
          <div className="flex items-start gap-2 mt-2">
            <input
              type="checkbox"
              id="sm-configs"
              checked={applyConfigs}
              onChange={(e) => setApplyConfigs(e.target.checked)}
              className="mt-1 h-3.5 w-3.5 appearance-none rounded-sm border border-primary bg-transparent checked:bg-primary checked:after:absolute checked:after:left-[5px] checked:after:top-[3px] checked:after:h-[6px] checked:after:w-[3px] checked:after:rotate-45 checked:after:border-r-2 checked:after:border-b-2 checked:after:border-primary-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 relative"
            />
            <div className="grid gap-1.5 leading-none">
              <label htmlFor="sm-configs" className="text-sm font-medium leading-none cursor-pointer">
                Apply Recommended Git Configurations Locally
              </label>
              <p className="text-xs text-muted-foreground">
                Sets <code>submodule.recurse = true</code> and <code>push.recurseSubmodules = on-demand</code> to natively solve typical branch switching errors.
              </p>
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!url.trim()}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
            >
              Add Submodule
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
