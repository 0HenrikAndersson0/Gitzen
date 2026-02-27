import { GitBranch, Tag, ArrowRight } from 'lucide-react';
import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { CommitDetails } from './CommitDetails';
import { CreateTagDialog } from './CreateTagDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';

interface Commit {
  id: string;
  message: string;
  author: string;
  timestamp: Date;
  branch?: string;
  hash: string;
  isMerge?: boolean;
  parents?: string[];
  refs?: string;
  tags?: string[];
}

interface CommitGraphProps {
  commits?: Commit[];
  currentBranch: string;
  hasMore?: boolean;
  onStashAction?: () => void;
  onLoadMore?: (amount: number) => void;
  onCherryPick?: (commitHash: string) => void;
  onRevertCommit?: (commitHash: string) => void;
  onResetCommits?: (commitHash: string) => void;
}

// Layout Engine
interface GraphNode {
  id: string;
  x: number;
  y: number;
  color: string;
  commit: Commit;
}

interface GraphEdge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
}

const COLORS = [
  'hsl(var(--success))', // emerald
  'hsl(var(--info))',    // blue
  'hsl(var(--foreground))', // purple -> neutral foreground
  'hsl(var(--warning))',   // orange
  'hsl(var(--muted-foreground))', // pink -> muted
  'hsl(var(--success))', // cyan -> success 
  'hsl(var(--warning))', // lime -> warning
  'hsl(var(--destructive))', // rose -> destructive
];

function useGraphLayout(commits: Commit[], spacingX: number = 24, spacingY: number = 40) {
  return useMemo(() => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Map of commit hash -> occupied lane index
    // Note: commits are processed newest to oldest (top to bottom)

    // Map commit hash -> lane index it was assigned to
    const commitLaneMap = new Map<string, number>();

    // Helper to find a lane for a commit
    // If the commit is already expected by a parent (from above), it has a reserved lane?
    // Actually, processing Top -> Bottom:
    // When we see a commit, we check if any active lane is 'expecting' this commit (i.e. is a parent of a previous node)

    // Active lanes state: each lane holds the hash of the *next* commit it expects (the parent of the current tip)
    const activeLanes: (string | null)[] = [];

    commits.forEach((commit, index) => {
      // 1. Identify which lane this commit belongs to
      // Find ALL lanes that are expecting this commit
      const expectingLanes: number[] = [];
      activeLanes.forEach((hash, idx) => {
        if (hash === commit.id) {
          expectingLanes.push(idx);
        }
      });

      let laneIndex: number;

      if (expectingLanes.length === 0) {
        // Not expected by any existing lane -> Start of a new branch (tip)
        // Find first null lane or append
        laneIndex = activeLanes.findIndex(l => l === null);
        if (laneIndex === -1) {
          laneIndex = activeLanes.length;
          activeLanes.push(null);
        }
      } else {
        // Expected by one or more lanes (continuation or merge base)
        // Pick the leftmost lane to keep graph compact
        laneIndex = Math.min(...expectingLanes);

        // Clear ALL lanes that were expecting this commit to free them up
        expectingLanes.forEach(idx => {
          activeLanes[idx] = null;
        });
      }

      // Assign lane
      commitLaneMap.set(commit.id, laneIndex);

      // Determine color based on lane index
      const color = COLORS[laneIndex % COLORS.length];

      nodes.push({
        id: commit.id,
        x: laneIndex * spacingX + 10, // Margin
        y: index * spacingY + 20,
        color,
        commit
      });

      // 2. Prepare lanes for parents
      const parents = commit.parents || [];

      // First parent continues the current lane
      if (parents.length > 0) {
        const p1 = parents[0];
        // If the lane was cleared above, we can now reuse it for the parent
        activeLanes[laneIndex] = p1;

        // Merge parents (2nd, 3rd...) need new lanes
        for (let i = 1; i < parents.length; i++) {
          const p = parents[i];
          // Find a free lane for this parent
          // Note: We check if p is already expected by *another* lane is not strictly necessary 
          // because the resolution step (1) will handle merging lanes later.
          // We just need to ensure we output an expectation.

          // However, optimization: if we can find a lane ALREADY expecting p, we don't need another one?
          // No, because valid graph structure might have parallel lines merging later.
          // Visual separation is good.

          let pLane = activeLanes.findIndex(l => l === null);
          if (pLane === -1) {
            pLane = activeLanes.length;
            activeLanes.push(null);
          }
          activeLanes[pLane] = p;
        }
      }
      // If no parents, activeLanes[laneIndex] remains null (set in step 1 or initially), so lane ends.
    });

    // Second pass to create edges since we now know all coordinates
    commits.forEach((commit, index) => {
      const sourceNode = nodes[index];
      const parents = commit.parents || [];

      parents.forEach(parentId => {
        const targetNode = nodes.find(n => n.id === parentId);
        if (targetNode) {
          edges.push({
            fromX: sourceNode.x,
            fromY: sourceNode.y,
            toX: targetNode.x,
            toY: targetNode.y,
            color: sourceNode.color
          });
        } else {
          // Parent is not in the list (history truncated), point downwards to infinity
          edges.push({
            fromX: sourceNode.x,
            fromY: sourceNode.y,
            toX: sourceNode.x,
            toY: (commits.length + 1) * spacingY,
            color: sourceNode.color
          });
        }
      });
    });

    return { nodes, edges, width: activeLanes.length * spacingX + 40, height: commits.length * spacingY + 40 };
  }, [commits, spacingX, spacingY]);
}

export const CommitGraph = memo(function CommitGraph({
  commits = [],
  hasMore = false,
  onLoadMore,
  onCherryPick,
  onRevertCommit,
  onResetCommits,
  currentBranch,
}: CommitGraphProps) {
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [commitsWithTags, setCommitsWithTags] = useState<Commit[]>(commits);
  const [hoveredCommitId, setHoveredCommitId] = useState<string | null>(null);
  const [loadAmount, setLoadAmount] = useState('50');
  const containerRef = useRef<HTMLDivElement>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; commitHash: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Tag Dialog State
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [tagTargetCommit, setTagTargetCommit] = useState<string | undefined>(undefined);

  // Custom Graph Props
  const spacingX = 20;
  const spacingY = 36;
  const { nodes, edges, width, height } = useGraphLayout(commits, spacingX, spacingY);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Find commit corresponding to currentBranch tip
  const currentBranchHeadId = useMemo(() => {
    if (!currentBranch || !commits.length) return null;
    return commits.find(c => {
      if (!c.refs) return false;
      // Check for "HEAD -> branchName" or just "branchName"
      const refs = c.refs.split(',').map(r => r.trim());
      return refs.includes(`HEAD -> ${currentBranch}`) || refs.includes(currentBranch);
    })?.id;
  }, [commits, currentBranch]);

  // Scroll to HEAD on mount or when branch changes
  useEffect(() => {
    if (currentBranchHeadId && containerRef.current && nodesRef.current.length > 0) {
      const node = nodesRef.current.find(n => n.id === currentBranchHeadId);
      if (node) {
        containerRef.current.scrollTo({
          top: Math.max(0, node.y - 150),
          behavior: 'smooth'
        });
      }
    }
  }, [currentBranchHeadId]);

  // Load tags for commits
  const loadTags = async () => {
    try {
      const result = await window.electronAPI.getTags();
      if (result.success && result.tags) {
        // Create a map of commit hash -> tags
        const tagsMap = new Map<string, string[]>();

        result.tags.forEach(tag => {
          if (tag.commit) {
            const existing = tagsMap.get(tag.commit) || [];
            existing.push(tag.name);
            tagsMap.set(tag.commit, existing);
          }
        });

        const commitsWithTagsData = commits.map(commit => {
          // Try to find tags for this commit using its short hash (id)
          let tags = tagsMap.get(commit.id) || [];

          // Fallback: Check if we have tags for the full hash if available
          if (tags.length === 0 && commit.hash) {
            const fullHashTags = tagsMap.get(commit.hash);
            if (fullHashTags) tags = fullHashTags;
          }

          if (tags.length > 0) {
            return { ...commit, tags };
          }
          return commit;
        });

        setCommitsWithTags(commitsWithTagsData);
      }
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  };

  useEffect(() => {
    if (commits.length > 0) {
      loadTags();
    }
  }, [commits]);

  const handleContextMenu = (e: React.MouseEvent, commitHash: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      commitHash: commitHash,
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as globalThis.Node)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

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
      <div className="rounded-lg border border-border bg-card/50 p-6">
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="h-5 w-5 text-black dark:text-emerald-400" />
          <h2 className="font-semibold text-foreground">Commit History</h2>
        </div>
        <div className="text-center text-muted-foreground py-8">
          No commits to display
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 overflow-hidden flex flex-col h-full">
      <div className="p-6 pb-4 flex items-center gap-2 border-b border-border">
        <GitBranch className="h-5 w-5 text-black dark:text-emerald-400" />
        <h2 className="font-semibold text-foreground">Commit History</h2>
        <span className="ml-auto text-sm text-muted-foreground">
          {commits.length} commit{commits.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-background relative"
      >
        <div className="relative" style={{ height: height + 80, minWidth: '100%' }}>
          {/* Graph Layer - Absolute positioned behind content */}
          <svg
            width={width + 20}
            height={height}
            className="absolute top-0 left-0 pointer-events-none z-10"
          >
            {edges.map((edge, i) => (
              <path
                key={`edge-${i}`}
                d={`M ${edge.fromX} ${edge.fromY} L ${edge.fromX} ${edge.fromY + 10} L ${edge.toX} ${edge.fromY + 25} L ${edge.toX} ${edge.toY}`}
                stroke={edge.color}
                strokeWidth="2"
                fill="none"
                opacity="0.6"
              />
            ))}
            {nodes.map((node) => (
              <g key={`node-${node.id}`}>
                {node.id === currentBranchHeadId && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r="8"
                    fill="none"
                    stroke={node.color}
                    strokeWidth="2"
                    className="animate-pulse"
                    opacity="0.8"
                  />
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="4"
                  fill={node.color}
                  stroke="#18181b" // zinc-950
                  strokeWidth="2"
                />
                {hoveredCommitId === node.id && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r="6"
                    fill="none"
                    stroke={node.color}
                    strokeWidth="2"
                    opacity="0.5"
                  />
                )}
              </g>
            ))}
          </svg>

          {/* Commit List Layer */}
          <div className="absolute top-0 left-0 right-0 z-20">
            {nodes.map((node) => {
              const commit = commitsWithTags.find(c => c.id === node.id) || node.commit;
              const isCurrentHead = node.id === currentBranchHeadId;

              return (
                <div
                  key={commit.id}
                  className={`absolute right-0 px-4 flex flex-col justify-center transition-colors border-b border-border/30 cursor-pointer ${hoveredCommitId === commit.id
                    ? 'bg-secondary/50'
                    : isCurrentHead
                      ? 'bg-accent font-medium'
                      : 'hover:bg-accent/30'
                    }`}
                  style={{
                    top: node.y - 18,
                    height: spacingY,
                    left: width + 20 // Offset content to right of graph
                  }}
                  onClick={() => setSelectedCommit(commit)}
                  onContextMenu={(e) => handleContextMenu(e, commit.hash)}
                  onMouseEnter={() => setHoveredCommitId(commit.id)}
                  onMouseLeave={() => setHoveredCommitId(null)}
                >
                  <div className="flex items-center gap-3">
                    <p className="font-medium text-foreground text-sm truncate flex-1 flex items-center gap-2">
                      {commit.message}
                    </p>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {commit.branch && (
                        <span className="inline-flex items-center gap-1 rounded bg-success/20 px-1.5 py-0.5 text-[10px] text-success border border-success/30">
                          {commit.branch}
                        </span>
                      )}
                      {commit.tags && commit.tags.map(tag => (
                        <span key={tag} className="inline-flex items-center gap-1 rounded bg-warning/20 px-1.5 py-0.5 text-[10px] text-black dark:text-warning border border-warning/30">
                          <Tag className="h-2 w-2" />
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground w-32 justify-end">
                      <span className="flex items-center gap-1 truncate max-w-[80px]">
                        {commit.author}
                      </span>
                      <span className="flex-shrink-0">
                        {formatTime(commit.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {onLoadMore && hasMore && (
            <div
              className="absolute left-0 right-0 flex items-center justify-center gap-2 border-t border-border/30"
              style={{ top: height, height: 80 }}
            >
              <span className="text-sm text-muted-foreground">Load</span>
              <Select value={loadAmount} onValueChange={setLoadAmount}>
                <SelectTrigger className="w-[80px] h-8 bg-card border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">more commits</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onLoadMore(parseInt(loadAmount))}
                className="ml-2 bg-card border-border hover:bg-accent"
              >
                Load
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Commit Details Overlay */}
      {selectedCommit && (
        <CommitDetails
          commit={selectedCommit}
          onClose={() => setSelectedCommit(null)}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-xl overflow-hidden py-1 min-w-[150px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div
            className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors flex items-center gap-2"
            onClick={() => {
              setTagTargetCommit(contextMenu.commitHash);
              setShowTagDialog(true);
              setContextMenu(null);
            }}
          >
            <Tag className="size-3.5 text-black dark:text-amber-400" />
            Add Tag...
          </div>
          {onCherryPick && (
            <div
              className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors flex items-center gap-2"
              onClick={() => {
                onCherryPick(contextMenu.commitHash);
                setContextMenu(null);
              }}
            >
              <ArrowRight className="size-3.5 text-foreground" />
              Cherry Pick Commit
            </div>
          )}
          {onRevertCommit && (
            <div
              className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors flex items-center gap-2"
              onClick={() => {
                onRevertCommit(contextMenu.commitHash);
                setContextMenu(null);
              }}
            >
              <div className="size-3.5 flex items-center justify-center font-bold text-red-400 text-xs">R</div>
              Revert Commit
            </div>
          )}
          {onResetCommits && (
            <div
              className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors flex items-center gap-2 border-t border-border mt-1 pt-1"
              onClick={() => {
                onResetCommits(contextMenu.commitHash);
                setContextMenu(null);
              }}
            >
              <div className="size-3.5 flex items-center justify-center font-bold text-foreground text-xs">X</div>
              Reset Branch to Here...
            </div>
          )}
        </div>
      )}

      {/* Create Tag Dialog */}
      <CreateTagDialog
        open={showTagDialog}
        onOpenChange={setShowTagDialog}
        commitHash={tagTargetCommit}
        onTagCreated={() => {
          loadTags();
          setTagTargetCommit(undefined);
        }}
      />
    </div>
  );
});