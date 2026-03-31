import { GitBranch, Tag, ArrowRight } from 'lucide-react';
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, memo, useCallback, forwardRef } from 'react';
import { CommitDetails } from './CommitDetails';
import { CreateTagDialog } from './CreateTagDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { FixedSizeList as List } from 'react-window';

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
  '#10b981', // emerald
  '#3b82f6', // blue
  '#a855f7', // purple
  '#f97316', // orange
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f43f5e', // rose
];

function useGraphLayout(commits: Commit[], spacingX: number = 24, spacingY: number = 40) {
  return useMemo(() => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const activeLanes: (string | null)[] = [];

    commits.forEach((commit, index) => {
      const expectingLanes: number[] = [];
      activeLanes.forEach((hash, idx) => {
        if (hash === commit.id) expectingLanes.push(idx);
      });

      let laneIndex: number;
      if (expectingLanes.length === 0) {
        laneIndex = activeLanes.findIndex(l => l === null);
        if (laneIndex === -1) {
          laneIndex = activeLanes.length;
          activeLanes.push(null);
        }
      } else {
        laneIndex = Math.min(...expectingLanes);
        expectingLanes.forEach(idx => { activeLanes[idx] = null; });
      }

      const color = COLORS[laneIndex % COLORS.length];
      nodes.push({
        id: commit.id,
        x: laneIndex * spacingX + 10,
        y: index * spacingY + spacingY / 2,
        color,
        commit
      });

      const parents = commit.parents || [];
      if (parents.length > 0) {
        activeLanes[laneIndex] = parents[0];
        for (let i = 1; i < parents.length; i++) {
          let pLane = activeLanes.findIndex(l => l === null);
          if (pLane === -1) {
            pLane = activeLanes.length;
            activeLanes.push(null);
          }
          activeLanes[pLane] = parents[i];
        }
      }
    });

    commits.forEach((commit, index) => {
      const sourceNode = nodes[index];
      const parents = commit.parents || [];
      parents.forEach(parentId => {
        const targetNode = nodes.find(n => n.id === parentId);
        if (targetNode) {
          edges.push({ fromX: sourceNode.x, fromY: sourceNode.y, toX: targetNode.x, toY: targetNode.y, color: sourceNode.color });
        } else {
          edges.push({ fromX: sourceNode.x, fromY: sourceNode.y, toX: sourceNode.x, toY: (commits.length + 1) * spacingY, color: sourceNode.color });
        }
      });
    });

    return { nodes, edges, width: activeLanes.length * spacingX + 40, height: commits.length * spacingY + 40 };
  }, [commits, spacingX, spacingY]);
}

const GraphContext = React.createContext<{
  width: number; height: number; edges: GraphEdge[]; nodes: GraphNode[]; currentBranchHeadId: string | null | undefined;
}>({ width: 0, height: 0, edges: [], nodes: [], currentBranchHeadId: null });

const InnerElement = forwardRef<HTMLDivElement, React.HTMLProps<HTMLDivElement>>(({ children, style, ...rest }, ref) => {
  const { width, height, edges, nodes, currentBranchHeadId } = React.useContext(GraphContext);
  return (
    <div ref={ref} style={{ ...style, position: 'relative', overflow: 'visible', minWidth: '100%' }} {...rest}>
      <svg width={width + 20} height={height} className="absolute top-0 left-0 pointer-events-none z-10">
        {edges.map((edge, i) => (
          <path key={`edge-${i}`} d={`M ${edge.fromX} ${edge.fromY} L ${edge.fromX} ${edge.fromY + 10} L ${edge.toX} ${edge.fromY + 25} L ${edge.toX} ${edge.toY}`} stroke={edge.color} strokeWidth="2" fill="none" opacity="0.6" />
        ))}
        {nodes.map((node) => (
          <g key={`node-${node.id}`}>
            {node.id === currentBranchHeadId && <circle cx={node.x} cy={node.y} r="8" fill="none" stroke={node.color} strokeWidth="2" className="animate-pulse" opacity="0.8" />}
            <circle cx={node.x} cy={node.y} r="4" fill={node.color} stroke="#18181b" strokeWidth="2" />
          </g>
        ))}
      </svg>
      {children}
    </div>
  );
});

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
  const listRef = useRef<List>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ height: 0, width: 0 });

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; commitHash: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [tagTargetCommit, setTagTargetCommit] = useState<string | undefined>(undefined);

  const spacingX = 20;
  const spacingY = 36;
  const { nodes, edges, width, height } = useGraphLayout(commits, spacingX, spacingY);

  useLayoutEffect(() => {
    const updateSize = () => {
      if (measureRef.current) {
        const { offsetHeight, offsetWidth } = measureRef.current;
        if (offsetHeight !== dimensions.height || offsetWidth !== dimensions.width) {
          setDimensions({ height: offsetHeight, width: offsetWidth });
        }
      }
    };

    const observer = new ResizeObserver(updateSize);
    if (measureRef.current) observer.observe(measureRef.current);
    updateSize();

    // Polling fallback for edge cases where ResizeObserver doesn't fire immediately
    const interval = setInterval(updateSize, 500);
    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, [dimensions]);

  const currentBranchHeadId = useMemo(() => {
    if (!currentBranch || !commits.length) return null;
    return commits.find(c => {
        if (!c.refs) return false;
        const refs = c.refs.split(',').map(r => r.trim());
        return refs.includes(`HEAD -> ${currentBranch}`) || refs.includes(currentBranch);
    })?.id;
  }, [commits, currentBranch]);

  useEffect(() => {
    if (currentBranchHeadId && listRef.current && nodes.length > 0) {
      const index = nodes.findIndex(n => n.id === currentBranchHeadId);
      if (index !== -1) listRef.current.scrollToItem(index, 'center');
    }
  }, [currentBranchHeadId, nodes]);

  const loadTags = async () => {
    try {
      const result = await window.electronAPI.getTags();
      if (result.success && result.tags) {
        const tagsMap = new Map<string, string[]>();
        result.tags.forEach(tag => {
          if (tag.commit) {
            const existing = tagsMap.get(tag.commit) || [];
            existing.push(tag.name);
            tagsMap.set(tag.commit, existing);
          }
        });
        const commitsWithTagsData = commits.map(commit => {
          let tags = tagsMap.get(commit.id) || [];
          if (tags.length === 0 && commit.hash) {
             const fullHashTags = tagsMap.get(commit.hash);
             if (fullHashTags) tags = fullHashTags;
          }
          return tags.length > 0 ? { ...commit, tags } : commit;
        });
        setCommitsWithTags(commitsWithTagsData);
      }
    } catch (error) { console.error('Failed to load tags:', error); }
  };

  useEffect(() => { if (commits.length > 0) loadTags(); }, [commits]);

  const handleContextMenu = (e: React.MouseEvent, commitHash: string) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, commitHash });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as globalThis.Node)) setContextMenu(null); };
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  const formatTime = useCallback((date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'just now';
  }, []);

  const getBranchBadgeStyle = (branchName: string) => {
    if (branchName.startsWith('feature/')) return 'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20';
    if (branchName.startsWith('bugfix/')) return 'bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-500/20';
    if (branchName.startsWith('release/')) return 'bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/20';
    if (branchName.startsWith('hotfix/')) return 'bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20';
    if (branchName.startsWith('support/')) return 'bg-cyan-100 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-500/20';
    return 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20';
  };

  const Row = useCallback(({ index, style }: { index: number, style: React.CSSProperties }) => {
    const node = nodes[index];
    if (!node) return null;
    const commit = commitsWithTags.find(c => c.id === node.id) || node.commit;
    const isCurrentHead = node.id === currentBranchHeadId;

    return (
      <div
        className={`absolute pr-4 flex flex-col justify-center transition-colors border-b border-border/30 cursor-pointer ${hoveredCommitId === commit.id ? 'bg-secondary/50' : isCurrentHead ? 'bg-emerald-100 dark:bg-emerald-950/20' : 'hover:bg-accent/30'}`}
        style={{ ...style, left: 0, paddingLeft: width + 20, boxSizing: 'border-box' }}
        onClick={() => setSelectedCommit(commit)}
        onContextMenu={(e) => handleContextMenu(e, commit.hash)}
        onMouseEnter={() => setHoveredCommitId(commit.id)}
        onMouseLeave={() => setHoveredCommitId(null)}
      >
        <div className="flex items-center gap-3">
          <p className="font-medium text-foreground text-sm truncate flex-1 flex items-center gap-2">{commit.message}</p>
          <div className="flex items-center gap-2 flex-shrink-0">
            {commit.branch && <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] border ${getBranchBadgeStyle(commit.branch)}`}>{commit.branch}</span>}
            {commit.tags && commit.tags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20"><Tag className="h-2 w-2" />{tag}</span>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground w-32 justify-end">
            <span className="flex items-center gap-1 truncate max-w-[80px]">{commit.author}</span>
            <span className="flex-shrink-0">{formatTime(commit.timestamp)}</span>
          </div>
        </div>
      </div>
    );
  }, [nodes, commitsWithTags, currentBranchHeadId, hoveredCommitId, width, formatTime]);

  if (commits.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card/50 p-6 h-full">
        <div className="flex items-center gap-2 mb-4"><GitBranch className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /><h2 className="font-semibold text-foreground">Commit History</h2></div>
        <div className="text-center text-muted-foreground py-8">No commits to display</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 overflow-hidden flex flex-col h-full">
      <div className="p-6 pb-4 flex items-center gap-2 border-b border-border flex-none">
        <GitBranch className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /><h2 className="font-semibold text-foreground">Commit History</h2>
        <span className="ml-auto text-sm text-muted-foreground">{commits.length} commit{commits.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex-1 min-h-0 bg-background relative" ref={measureRef}>
        {dimensions.height > 0 && (
          <GraphContext.Provider value={{ width, height, edges, nodes, currentBranchHeadId }}>
            <List
              ref={listRef}
              height={dimensions.height}
              itemCount={nodes.length}
              itemSize={spacingY}
              width={dimensions.width || '100%'}
              innerElementType={InnerElement}
              className="scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
            >
              {Row}
            </List>
          </GraphContext.Provider>
        )}

        {onLoadMore && hasMore && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 bg-secondary/90 backdrop-blur rounded-full border border-border shadow-lg z-30">
            <span className="text-xs text-muted-foreground ml-2">Load</span>
            <Select value={loadAmount} onValueChange={setLoadAmount}>
              <SelectTrigger className="w-[70px] h-7 bg-card border-border text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem><SelectItem value="200">200</SelectItem><SelectItem value="500">500</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => onLoadMore(parseInt(loadAmount))} className="h-7 px-3 bg-primary text-primary-foreground hover:bg-primary/90 border-none text-xs">More</Button>
          </div>
        )}
      </div>

      {selectedCommit && <CommitDetails commit={selectedCommit} onClose={() => setSelectedCommit(null)} />}

      {contextMenu && (
        <div ref={menuRef} className="fixed z-50 bg-secondary border border-border rounded-md shadow-xl overflow-hidden py-1 min-w-[150px]" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors flex items-center gap-2" onClick={() => { setTagTargetCommit(contextMenu.commitHash); setShowTagDialog(true); setContextMenu(null); }}>
            <Tag className="size-3.5 text-amber-600 dark:text-amber-400" /> Add Tag...
          </div>
          {onCherryPick && (<div className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors flex items-center gap-2" onClick={() => { onCherryPick(contextMenu.commitHash); setContextMenu(null); }}><ArrowRight className="size-3.5 text-blue-400" /> Cherry Pick Commit</div>)}
          {onRevertCommit && (<div className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors flex items-center gap-2" onClick={() => { onRevertCommit(contextMenu.commitHash); setContextMenu(null); }}><div className="size-3.5 flex items-center justify-center font-bold text-red-400 text-xs">R</div> Revert Commit</div>)}
          {onResetCommits && (<div className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors flex items-center gap-2 border-t border-border mt-1 pt-1" onClick={() => { onResetCommits(contextMenu.commitHash); setContextMenu(null); }}><div className="size-3.5 flex items-center justify-center font-bold text-orange-400 text-xs">X</div> Reset Branch to Here...</div>)}
        </div>
      )}

      <CreateTagDialog open={showTagDialog} onOpenChange={setShowTagDialog} commitHash={tagTargetCommit} onTagCreated={() => { loadTags(); setTagTargetCommit(undefined); }} />
    </div>
  );
});