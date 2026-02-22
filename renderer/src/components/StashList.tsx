
import { Archive, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Input } from './ui/input';

interface Stash {
  name: string;
  message: string;
}

interface StashListProps {
  stashes: Stash[];
  onApplyStash: (name: string) => void;
  onDeleteStash: (name: string) => void;
}

export function StashList({ stashes, onApplyStash, onDeleteStash }: StashListProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; stash: Stash } | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [filter, setFilter] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = (e: React.MouseEvent, stash: Stash) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, stash });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  return (
    <>
      <div className="border-b border-border p-3 flex items-center gap-2 text-foreground cursor-pointer hover:bg-accent/30 transition-colors"
           onClick={() => setIsExpanded(!isExpanded)}>
        {isExpanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
        <Archive className="size-4" />
        <h3 className="font-semibold text-sm">Stashes</h3>
      </div>
      {isExpanded && (
        <div className="flex flex-col">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter stashes..."
                className="h-7 pl-7 text-xs bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-zinc-700"
              />
            </div>
          </div>
          <div className="">
            {stashes.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No stashes</div>
            ) : (
              <div className="divide-y divide-border">
                {stashes
                  .filter(s => s.message.toLowerCase().includes(filter.toLowerCase()) || s.name.toLowerCase().includes(filter.toLowerCase()))
                  .map((stash) => (
                  <div
                    key={stash.name}
                    className="group flex items-center justify-between p-2.5 transition-colors hover:bg-accent/50"
                    onContextMenu={(e) => handleContextMenu(e, stash)}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      <Archive className="size-3.5 flex-shrink-0 mt-0.5 text-amber-400" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-foreground">{stash.message}</div>
                        <div className="text-[10px] text-muted-foreground">{stash.name}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-xl overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div
            className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors"
            onClick={() => {
              onApplyStash(contextMenu.stash.name);
              handleCloseContextMenu();
            }}
          >
            Apply Stash
          </div>
          <div
            className="px-4 py-2 text-sm text-red-400 hover:bg-muted cursor-pointer transition-colors"
            onClick={() => {
              onDeleteStash(contextMenu.stash.name);
              handleCloseContextMenu();
            }}
          >
            Delete Stash
          </div>
        </div>
      )}
    </>
  );
}
