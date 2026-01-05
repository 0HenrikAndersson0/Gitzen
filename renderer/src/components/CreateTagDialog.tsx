import { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreateTagDialogProps {
  commitHash: string;
  onClose: () => void;
  onCreateTag: (tagName: string, message: string) => Promise<void>;
}

export function CreateTagDialog({ commitHash, onClose, onCreateTag }: CreateTagDialogProps) {
  const [tagName, setTagName] = useState('');
  const [message, setMessage] = useState('');

  const handleCreateTag = async () => {
    await onCreateTag(tagName, message);
    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Tag</DialogTitle>
          <DialogDescription>
            Create a new tag for commit <span className="font-mono">{commitHash}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="tag-name" className="text-right">
              Tag Name
            </Label>
            <Input
              id="tag-name"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="message" className="text-right">
              Message
            </Label>
            <Input
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleCreateTag}>Create Tag</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
