import { GitCommit, GitBranch, User, Clock, GitMerge, Tag } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { CommitDetails } from './CommitDetails';

interface Commit {
  id: string;
  message: string;
  author: string;
  timestamp: Date;
  branch?: string;
  hash: string;
  lane: number;
  isMerge?: boolean;
  parentLanes?: number[];
  tags?: string[];
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
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [commitsWithTags, setCommitsWithTags] = useState<Commit[]>(commits);
  const menuRef = useRef<HTMLDivElement>(null);

  // Load tags for commits
  useEffect(() => {
    const loadTags = async () => {
      const commitsWithTagsData = await Promise.all(
        commits.map(async (commit) => {
          try {
            const result = await (window.electronAPI as any).getTagsForCommit(commit.hash);
            if (result.success && result.tags && result.tags.length > 0) {
              return { ...commit, tags: result.tags };
            }
            return commit;
          } catch (error) {
            console.error(`Failed to load tags for commit ${commit.hash}:`, error);
            return commit;
          }
        })
      );
      setCommitsWithTags(commitsWithTagsData);
    };

    if (commits.length > 0) {
      loadTags();
    }
  }, [commits]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as HTMLElement)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, commit: Commit) => {
    if (commit.branch && commit.branch !== currentBranch) {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        commit,
      });
    }
  };

  const handleMenuAction = (action: 'rebase' | 'interactive-rebase' | 'merge') => {
    if (!contextMenu || !contextMenu.commit.branch) return;

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

  // Color mapping for lanes
  const laneColors: Record<number, { border: string; bg: string; text: string }> = {
    0: { border: 'border-emerald-500', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
    1: { border: 'border-blue-500', bg: 'bg-blue-500/20', text: 'text-blue-400' },
    2: { border: 'border-purple-500', bg: 'bg-purple-500/20', text: 'text-purple-400' },
    3: { border: 'border-orange-500', bg: 'bg-orange-500/20', text: 'text-orange-400' },
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden flex flex-col">
      <div className="p-6 pb-4 flex items-center gap-2 border-b border-zinc-800">
        <GitBranch className="h-5 w-5 text-emerald-400" />
        <h2 className="font-semibold text-zinc-100">Commit History</h2>
        <span className="ml-auto text-sm text-zinc-500">
          {commits.length} commit{commits.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="overflow-y-auto max-h-[600px] p-6">
        <div className="space-y-0 font-mono text-sm">
          {commitsWithTags.map((commit, index) => {
            const colors = laneColors[commit.lane % 4] || laneColors[0];
            const nextCommit = commits[index + 1];

            return (
              <div key={commit.id} className="relative">
                <div className="flex items-start gap-2 py-2 group hover:bg-zinc-800/30 rounded px-2 -mx-2 transition-colors">
                  {/* Graph visualization */}
                  <div className="flex-shrink-0" style={{ width: `${maxLanes * laneWidth}px` }}>
                    <div className="relative flex items-center" style={{ height: '32px' }}>
                      {/* Vertical lines and commit nodes for each lane */}
                      {Array.from({ length: maxLanes }).map((_, lane) => {
                        const hasCommitInLane = commit.lane === lane;
                        const nextHasCommitInLane = nextCommit?.lane === lane;
                        const isParentLane = commit.isMerge && commit.parentLanes?.includes(lane);
                        const shouldDrawLine = nextHasCommitInLane || isParentLane;
                        
                        if (!shouldDrawLine && !hasCommitInLane) return null;

                        const laneColor = laneColors[lane % 4] || laneColors[0];
                        const laneX = lane * laneWidth + laneWidth / 2 - 1;
                        
                        return (
                          <div
                            key={lane}
                            className="absolute"
                            style={{
                              left: `${laneX}px`,
                              height: '100%',
                            }}
                          >
                            {/* Vertical line */}
                            {shouldDrawLine && (
                              <div
                                className={`absolute top-4 w-0.5 ${
                                  lane === 0 ? 'bg-emerald-500/50' :
                                  lane === 1 ? 'bg-blue-500/50' :
                                  lane === 2 ? 'bg-purple-500/50' :
                                  'bg-orange-500/50'
                                }`}
                                style={{ 
                                  height: index < commits.length - 1 ? 'calc(100% + 100%)' : '100%',
                                  transform: 'translateX(-50%)',
                                }}
                              />
                            )}
                            
                            {/* Commit node */}
                            {hasCommitInLane && (
                              <div
                                className={`absolute top-0 left-1/2 -translate-x-1/2 flex h-6 w-6 items-center justify-center rounded-full border-2 ${laneColor.border} bg-zinc-900 z-10`}
                              >
                                {commit.isMerge ? (
                                  <GitMerge className={`h-3 w-3 ${laneColor.text}`} />
                                ) : (
                                  <GitCommit className={`h-3 w-3 ${laneColor.text}`} />
                                )}
                              </div>
                            )}
                            
                            {/* Horizontal merge line */}
                            {isParentLane && lane !== commit.lane && (
                              <svg
                                className="absolute top-4"
                                style={{
                                  left: hasCommitInLane ? `${laneX}px` : `${commit.lane * laneWidth + laneWidth / 2}px`,
                                  width: `${Math.abs(commit.lane - lane) * laneWidth}px`,
                                  height: '2px',
                                  transform: 'translateY(-50%)',
                                }}
                              >
                                <line
                                  x1="0"
                                  y1="0"
                                  x2={Math.abs(commit.lane - lane) * laneWidth}
                                  y2="0"
                                  stroke={lane === 1 ? '#3b82f6' : lane === 2 ? '#a855f7' : '#f97316'}
                                  strokeWidth="2"
                                  opacity="0.5"
                                />
                              </svg>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Commit info */}
                  <div 
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setSelectedCommit(commit)}
                    onContextMenu={(e) => handleContextMenu(e, commit)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium text-zinc-200 group-hover:text-zinc-100 text-base">
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
                      {commit.branch && (
                        <div className="flex items-center gap-1">
                          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${colors.bg}`}>
                            <GitBranch className="h-3 w-3" />
                            <span className={colors.text}>{commit.branch}</span>
                          </span>
                        </div>
                      )}
                      {commit.tags && commit.tags.map(tag => (
                        <div key={tag} className="flex items-center gap-1">
                          <Tag className="h-3 w-3 text-amber-400" />
                          <span className="text-zinc-400">{tag}</span>
                        </div>
                      ))}
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
          className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded shadow-lg"
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

      {/* Commit Details Overlay */}
      {selectedCommit && (
        <CommitDetails
          commit={selectedCommit}
          onClose={() => setSelectedCommit(null)}
        />
      )}
    </div>
  );
}
