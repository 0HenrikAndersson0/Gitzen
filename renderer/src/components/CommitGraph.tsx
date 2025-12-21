import { GitCommit, GitBranch, User, Clock, GitMerge } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface Commit {
  id: string;
  message: string;
  author: string;
  timestamp: Date;
  branch: string;
  hash: string;
  lane: number;
  isMerge?: boolean;
  parentLanes?: number[];
}

interface CommitGraphProps {
  commits?: Commit[];
  currentBranch: string;
  onRebase?: (branch: string) => void;
  onInteractiveRebase?: (branch: string) => void;
  onMergeBranch?: (branch: string) => void;
}

export function CommitGraph({ commits = [], currentBranch, onRebase, onInteractiveRebase, onMergeBranch }: CommitGraphProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; commit: Commit } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const handleContextMenu = (e: React.MouseEvent, commit: Commit) => {
    if (commit.branch !== currentBranch) {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        commit,
      });
    }
  };

  const handleMenuAction = (action: 'rebase' | 'interactive-rebase' | 'merge') => {
    if (!contextMenu) return;

    const branch = contextMenu.commit.branch;
    
    switch (action) {
      case 'rebase':
        onRebase?.(branch);
        break;
      case 'interactive-rebase':
        onInteractiveRebase?.(branch);
        break;
      case 'merge':
        onMergeBranch?.(branch);
        break;
    }

    setContextMenu(null);
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'just now';
  };

  if (commits.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="h-5 w-5 text-emerald-400" />
          <h2 className="font-semibold text-zinc-100">Commit History</h2>
        </div>
        <div className="text-center text-zinc-500 py-8">
          No commits to display
        </div>
      </div>
    );
  }

  const maxLanes = Math.max(...commits.map((c) => c.lane)) + 1;
  const laneWidth = 24;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden flex flex-col">
      <div className="p-6 pb-4 flex items-center gap-2 border-b border-zinc-800">
        <GitBranch className="h-5 w-5 text-emerald-400" />
        <h2 className="font-semibold text-zinc-100">Commit History</h2>
        <span className="ml-auto text-sm text-zinc-500">
          {commits.length} commit{commits.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="overflow-y-auto max-h-[600px] p-6 pt-4">
        <div className="space-y-0">
          {commits.map((commit, index) => {
            const branchColors: Record<number, { border: string; bg: string; text: string }> = {
              0: { border: 'border-emerald-500', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
              1: { border: 'border-blue-500', bg: 'bg-blue-500/20', text: 'text-blue-400' },
              2: { border: 'border-purple-500', bg: 'bg-purple-500/20', text: 'text-purple-400' },
              3: { border: 'border-orange-500', bg: 'bg-orange-500/20', text: 'text-orange-400' },
            };
            const colors = branchColors[commit.lane % 4] || branchColors[0];
            const nextCommit = commits[index + 1];
            
            return (
              <div key={commit.id} className="relative">
                <div 
                  className="absolute left-0 top-0 bottom-0 flex items-start pt-3"
                  style={{ width: `${maxLanes * laneWidth}px` }}
                >
                  {Array.from({ length: maxLanes }).map((_, lane) => {
                    const hasCommitInLane = commit.lane === lane;
                    const nextHasCommitInLane = nextCommit?.lane === lane;
                    const shouldDrawLine = nextHasCommitInLane || 
                      (commit.isMerge && commit.parentLanes?.includes(lane));
                    
                    if (!shouldDrawLine && !hasCommitInLane) return null;

                    const laneColors = branchColors[lane % 4] || branchColors[0];
                    
                    return (
                      <div
                        key={lane}
                        className="relative"
                        style={{ 
                          width: `${laneWidth}px`,
                          height: '100%',
                        }}
                      >
                        {shouldDrawLine && index < commits.length - 1 && (
                          <div
                            className={`absolute top-6 w-0.5 h-full ${
                              lane === 0 ? 'bg-emerald-500/50' :
                              lane === 1 ? 'bg-blue-500/50' :
                              lane === 2 ? 'bg-purple-500/50' :
                              'bg-orange-500/50'
                            }`}
                            style={{
                              left: `${laneWidth / 2 - 1}px`,
                            }}
                          />
                        )}
                        
                        {commit.isMerge && commit.parentLanes && lane !== commit.lane && commit.parentLanes.includes(lane) && (
                          <svg
                            className="absolute top-3"
                            style={{
                              left: `${laneWidth / 2}px`,
                              width: `${Math.abs(commit.lane - lane) * laneWidth}px`,
                              height: '20px',
                            }}
                          >
                            <path
                              d={`M 0 0 Q ${Math.abs(commit.lane - lane) * laneWidth / 2} 10, ${Math.abs(commit.lane - lane) * laneWidth} 20`}
                              stroke={lane === 1 ? '#3b82f6' : lane === 2 ? '#a855f7' : '#f97316'}
                              strokeWidth="2"
                              fill="none"
                              opacity="0.5"
                            />
                          </svg>
                        )}
                      </div>
                    );
                  })}

                  <div
                    className="absolute top-3 z-10"
                    style={{
                      left: `${commit.lane * laneWidth + laneWidth / 2 - 12}px`,
                    }}
                  >
                    <div className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${colors.border} bg-zinc-900`}>
                      {commit.isMerge ? (
                        <GitMerge className={`h-3 w-3 ${colors.text}`} />
                      ) : (
                        <GitCommit className={`h-3 w-3 ${colors.text}`} />
                      )}
                    </div>
                  </div>
                </div>

                <div 
                  className="group rounded-md p-3 pl-3 transition-colors hover:bg-zinc-800/50 cursor-pointer"
                  style={{ 
                    marginLeft: `${maxLanes * laneWidth + 8}px`,
                  }}
                  onContextMenu={(e) => handleContextMenu(e, commit)}
                >
                  <div className="min-w-0">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <p className="font-medium text-zinc-200 group-hover:text-zinc-100">
                        {commit.message}
                      </p>
                      <code className="flex-shrink-0 rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                        {commit.hash}
                      </code>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>{commit.author}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{formatTime(commit.timestamp)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${colors.bg}`}>
                          <GitBranch className="h-3 w-3" />
                          <span className={colors.text}>{commit.branch}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {contextMenu && (
        <div
          ref={menuRef}
          className="absolute z-50 bg-zinc-800 border border-zinc-700 rounded shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div
            className="px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 cursor-pointer"
            onClick={() => handleMenuAction('rebase')}
          >
            Rebase
          </div>
          <div
            className="px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 cursor-pointer"
            onClick={() => handleMenuAction('interactive-rebase')}
          >
            Interactive Rebase
          </div>
          <div
            className="px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 cursor-pointer"
            onClick={() => handleMenuAction('merge')}
          >
            Merge
          </div>
        </div>
      )}
    </div>
  );
}

