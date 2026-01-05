
import { Archive, Trash2, Check } from 'lucide-react';

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
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-zinc-400">Stashes</h3>
      {stashes.length === 0 ? (
        <p className="text-xs text-zinc-500">No stashes</p>
      ) : (
        <ul className="space-y-1">
          {stashes.map((stash) => (
            <li
              key={stash.name}
              className="group flex items-center justify-between rounded-md px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              <div className="flex items-center gap-2">
                <Archive className="size-4 text-amber-400" />
                <span className="truncate">{stash.message}</span>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                <button onClick={() => onApplyStash(stash.name)} title="Apply Stash">
                  <Check className="size-4 text-green-400" />
                </button>
                <button onClick={() => onDeleteStash(stash.name)} title="Delete Stash">
                  <Trash2 className="size-4 text-red-400" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
