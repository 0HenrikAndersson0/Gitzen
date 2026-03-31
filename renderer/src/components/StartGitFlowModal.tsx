import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";

import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type BranchType = 'feature' | 'bugfix' | 'release' | 'hotfix' | 'support';

interface StartGitFlowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (type: BranchType, name: string) => void;
}

export function StartGitFlowModal({ open, onOpenChange, onStart }: StartGitFlowModalProps) {
  const [type, setType] = useState<BranchType>('feature');
  const [name, setName] = useState('');

  const handleStart = () => {
    if (!name.trim()) return;
    onStart(type, name.trim());
    setName('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Start Git Flow Branch</DialogTitle>
          <DialogDescription>
            Create a new branch governed by standard Git Flow prefixes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="type" className="text-right">
              Type
            </Label>
            <Select value={type} onValueChange={(val: BranchType) => setType(val)}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="feature">Feature</SelectItem>
                <SelectItem value="bugfix">Bugfix</SelectItem>
                <SelectItem value="release">Release</SelectItem>
                <SelectItem value="hotfix">Hotfix</SelectItem>
                <SelectItem value="support">Support</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <div className="col-span-3 flex items-center h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <span className="text-muted-foreground whitespace-nowrap pt-[1px] font-mono select-none pr-0.5">
                {type}/
              </span>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="branch-name"
                className="flex-1 bg-transparent border-none outline-none focus:ring-0 font-mono text-sm min-w-0 p-0"
                onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                autoFocus
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleStart} disabled={!name.trim()}>Start Branch</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
