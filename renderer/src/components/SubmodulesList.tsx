import React, { useState } from 'react';
import { Package, RefreshCw, DownloadCloud } from 'lucide-react';
import { Button } from './ui/button';

export interface Submodule {
  path: string;
  url: string;
  status: 'initialized' | 'uninitialized' | 'modified' | 'unknown';
}

interface SubmodulesListProps {
  submodules: Submodule[];
  onUpdate: (init: boolean) => void;
  onSync: () => void;
}

export function SubmodulesList({ submodules, onUpdate, onSync }: SubmodulesListProps) {
  if (submodules.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 mt-4 px-2">
      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-2 uppercase tracking-wider">
        <span>Submodules ({submodules.length})</span>
        <div className="flex gap-1">
          <button
            onClick={() => onUpdate(true)}
            title="Update & Init Submodules"
            className="p-1 hover:bg-accent hover:text-foreground rounded transition-colors"
          >
            <DownloadCloud className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onSync()}
            title="Sync Submodules"
            className="p-1 hover:bg-accent hover:text-foreground rounded transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {submodules.map((sub) => (
          <div
            key={sub.path}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent group"
          >
            <Package className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate flex-1" title={sub.path}>
              {sub.path}
            </span>
            {sub.status === 'uninitialized' && (
              <span className="text-[10px] bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20 px-1.5 py-0.5 rounded">
                Uninit
              </span>
            )}
            {sub.status === 'modified' && (
              <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">
                Mod
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
