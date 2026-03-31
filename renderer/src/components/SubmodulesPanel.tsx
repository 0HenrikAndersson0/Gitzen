import { useState } from 'react';
import { Plus, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink, Trash2, FolderSync, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Input } from './ui/input';

export interface SubmoduleStatus {
  name: string;
  path: string;
  url: string;
  commitHash: string;
  status: 'synced' | 'out-of-sync' | 'uninitialized' | 'conflict' | 'unknown';
}

interface SubmodulesPanelProps {
  submodules: SubmoduleStatus[];
  onAddSubmoduleClick: () => void;
  onSyncAll: () => void;
  onRemoveSubmodule: (path: string) => void;
  onOpenSubmodule: (path: string) => void;
}

export function SubmodulesPanel({
  submodules,
  onAddSubmoduleClick,
  onSyncAll,
  onRemoveSubmodule,
  onOpenSubmodule
}: SubmodulesPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [filter, setFilter] = useState('');

  if (!submodules) return null;

  return (
    <div className="rounded-lg border border-border bg-card/50 flex flex-col mt-4">
      <div className="border-b border-border p-3 flex items-center justify-between cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-2 text-foreground">
          {isExpanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
          <FolderSync className="size-4" />
          <h3 className="font-semibold text-sm">Submodules</h3>
        </div>

      </div>

      {isExpanded && (
        <div className="flex flex-col">
          <div className="p-2 border-b border-border flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter submodules..."
                className="h-7 pl-7 text-xs bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-zinc-700"
              />
            </div>
            {submodules.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSyncAll();
                }}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-transparent hover:border-border flex-shrink-0"
                title="Sync all submodules (git submodule update --init --recursive)"
              >
                <RefreshCw className="size-3.5" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddSubmoduleClick();
              }}
              className="p-1.5 rounded-md transition-colors border border-transparent hover:border-emerald-600/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600/10 flex-shrink-0"
              title="Add Submodule"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {submodules.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No submodules</div>
            ) : (
              <div className="divide-y divide-border">
                {submodules
                  .filter(sm => sm.name.toLowerCase().includes(filter.toLowerCase()) || sm.path.toLowerCase().includes(filter.toLowerCase()))
                  .map((sm, i) => (
                  <div key={i} className="group relative flex w-full items-center justify-between p-2.5 transition-colors hover:bg-accent/50 text-left overflow-hidden">
                    <div 
                      className="flex items-center gap-2.5 flex-1 min-w-0" 
                      title={
                        sm.status === 'out-of-sync' ? 'Out of sync' : 
                        sm.status === 'uninitialized' ? 'Not initialized' : 
                        sm.status === 'conflict' ? 'Merge conflict' : 'Synced'
                      }
                    >
                      {sm.status === 'out-of-sync' || sm.status === 'uninitialized' ? (
                        <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
                      ) : sm.status === 'conflict' ? (
                        <AlertTriangle className="size-3.5 text-red-500 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 flex flex-col min-w-0">
                        <span className="truncate text-foreground text-sm font-medium">{sm.name}</span>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="font-mono">{sm.commitHash ? sm.commitHash.substring(0, 7) : 'none'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons (visible on hover) */}
                    <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-accent/90 backdrop-blur-sm pl-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSubmodule(sm.path);
                        }}
                        className="p-1 rounded text-muted-foreground hover:bg-black/10 dark:hover:bg-white/10 hover:text-foreground transition-colors"
                        title="Open as Repository"
                      >
                        <ExternalLink className="size-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSyncAll();
                        }}
                        className="p-1 rounded text-muted-foreground hover:bg-black/10 dark:hover:bg-white/10 hover:text-foreground transition-colors"
                        title="Sync Submodule Content"
                      >
                        <FolderSync className="size-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveSubmodule(sm.path);
                        }}
                        className="p-1 rounded text-red-500/70 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                        title="Remove Submodule"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
