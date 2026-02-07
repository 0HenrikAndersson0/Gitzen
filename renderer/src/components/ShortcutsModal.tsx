import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  const shortcuts = [
    { action: 'Create branch', mac: '⌘B', win: 'Ctrl+B' },
    { action: 'Fetch all', mac: '⌘L', win: 'Ctrl+L' },
    { action: 'Stage the current file', mac: 'S', win: 'S' },
    { action: 'Stage all files', mac: '⌘ShiftS', win: 'Ctrl+Shift+S' },
    { action: 'Unstage the current file', mac: 'U', win: 'U' },
    { action: 'Unstage all files', mac: '⌘ShiftU', win: 'Ctrl+Shift+U' },
    { action: 'Commit staged files', mac: '⌘Enter', win: 'Ctrl+Enter' },
    { action: 'Stage all & Commit', mac: '⌘ShiftEnter', win: 'Ctrl+Shift+Enter' },
    { action: 'Focus commit message', mac: '⌘ShiftM', win: 'Ctrl+Shift+M' },
    { action: 'Open keyboard shortcuts', mac: '⌘/', win: 'Ctrl+/' },
  ];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold mb-4">Keyboard Shortcuts</DialogTitle>
          <DialogDescription className="sr-only">
             List of available keyboard shortcuts for Gitzen.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-y-2">
          <div className="grid grid-cols-12 gap-4 pb-2 border-b border-zinc-800 text-zinc-400 text-sm font-medium uppercase tracking-wider">
            <div className="col-span-6">Action</div>
            <div className="col-span-3">macOS</div>
            <div className="col-span-3">Windows/Linux</div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-1 custom-scrollbar">
            {shortcuts.map((shortcut) => (
              <div key={shortcut.action} className="grid grid-cols-12 gap-4 py-2 hover:bg-zinc-800/50 rounded px-2 transition-colors items-center">
                <div className="col-span-6 text-sm text-zinc-300 font-medium">{shortcut.action}</div>
                <div className="col-span-3">
                  <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 text-xs font-mono font-medium text-zinc-400 bg-zinc-800 rounded border border-zinc-700 shadow-sm">
                    {shortcut.mac}
                  </span>
                </div>
                <div className="col-span-3">
                  <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 text-xs font-mono font-medium text-zinc-400 bg-zinc-800 rounded border border-zinc-700 shadow-sm">
                    {shortcut.win}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
