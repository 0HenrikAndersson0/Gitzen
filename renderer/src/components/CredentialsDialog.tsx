import { useState } from 'react';
import { Lock } from 'lucide-react';
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

interface CredentialsDialogProps {
  open: boolean;
  onSubmit: (username: string, password: string) => void;
}

export function CredentialsDialog({ open, onSubmit }: CredentialsDialogProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = () => {
    if (username && password) {
      onSubmit(username, password);
      setUsername('');
      setPassword('');
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Lock className="size-5 text-yellow-400" />
            <DialogTitle>Git Credentials Required</DialogTitle>
          </div>
          <DialogDescription>
            Enter your Git credentials to authenticate this repository.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="git username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-zinc-950 border-zinc-700"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password / Token</Label>
            <Input
              id="password"
              type="password"
              placeholder="password or personal access token"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-zinc-950 border-zinc-700"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!username || !password}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Save Credentials
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

