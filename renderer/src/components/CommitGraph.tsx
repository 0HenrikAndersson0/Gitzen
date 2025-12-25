import { GitBranch, User, Clock, Tag } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import { CommitDetails } from './CommitDetails';

interface Commit {
  id: string;
  message: string;
  author: string;
  timestamp: Date;
  branch?: string;
  hash: string;
  isMerge?: boolean;
  tags?: string[];
}

interface CommitGraphProps {
  commits?: Commit[];
  mermaidDiagram?: string;
  currentBranch: string;
  onRebase?: (branch: string) => void;
  onInteractiveRebase?: (branch: string) => void;
  onMergeBranch?: (branch: string) => void;
}

// Initialize mermaid with base theme and TB orientation
mermaid.initialize({
  startOnLoad: false,
  logLevel: 'debug',
  theme: 'base',
  gitGraph: {
    showBranches: false,
    showCommitLabel: true,
    mainBranchName: 'main',
    rotateCommitLabel: false,
  },
  themeVariables: {
    git0: '#10b981', // emerald
    git1: '#3b82f6', // blue
    git2: '#a855f7', // purple
    git3: '#f97316', // orange
    git4: '#ec4899', // pink
    git5: '#06b6d4', // cyan
    git6: '#84cc16', // lime
    git7: '#f43f5e', // rose
    gitBranchLabel0: '#10b981',
    gitBranchLabel1: '#3b82f6',
    gitBranchLabel2: '#a855f7',
    gitBranchLabel3: '#f97316',
    commitLabelColor: '#e4e4e7',
    commitLabelBackground: '#27272a',
    tagLabelColor: '#fbbf24',
    tagLabelBackground: '#422006',
    tagLabelBorder: '#f59e0b',
  },
});

export function CommitGraph({ 
  commits = [], 
  mermaidDiagram = '', 
  currentBranch, 
  onRebase, 
  onInteractiveRebase, 
  onMergeBranch 
}: CommitGraphProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; commit: Commit } | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [commitsWithTags, setCommitsWithTags] = useState<Commit[]>(commits);
  const [diagramSvg, setDiagramSvg] = useState<string>('');
  const [diagramError, setDiagramError] = useState<string>('');
  const [hoveredCommitId, setHoveredCommitId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const diagramRef = useRef<HTMLDivElement>(null);

  // Highlight node in diagram when hovering commit in list
  const highlightNode = (commitId: string | null) => {
    if (!diagramRef.current) return;
    
    // Reset all nodes first
    const allNodes = diagramRef.current.querySelectorAll('.commit');
    allNodes.forEach((node) => {
      (node as SVGElement).style.filter = '';
    });
    
    // Also reset circles
    const allCircles = diagramRef.current.querySelectorAll('circle');
    allCircles.forEach((circle) => {
      circle.style.filter = '';
    });
    
    if (!commitId) return;
    
    // Try to find and highlight the node
    // Mermaid uses various selectors for commit nodes
    const svg = diagramRef.current.querySelector('svg');
    if (!svg) return;
    
    // Look for text elements containing the commit ID
    const textElements = svg.querySelectorAll('text');
    textElements.forEach((text) => {
      if (text.textContent?.includes(commitId)) {
        // Found the label, highlight the parent group or nearby circle
        const parent = text.closest('g');
        if (parent) {
          const circle = parent.querySelector('circle');
          if (circle) {
            circle.style.filter = 'drop-shadow(0 0 8px #10b981) brightness(1.3)';
          }
        }
      }
    });
    
    // Also try to find by commit class or id
    const commitNodes = svg.querySelectorAll(`[id*="${commitId}"], [class*="${commitId}"]`);
    commitNodes.forEach((node) => {
      const circle = node.querySelector('circle') || (node.tagName === 'circle' ? node : null);
      if (circle) {
        (circle as SVGElement).style.filter = 'drop-shadow(0 0 8px #10b981) brightness(1.3)';
      }
    });
  };

  // Update highlight when hovered commit changes
  useEffect(() => {
    highlightNode(hoveredCommitId);
  }, [hoveredCommitId, diagramSvg]);

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

  // Render Mermaid diagram
  useEffect(() => {
    const renderDiagram = async () => {
      if (!mermaidDiagram) {
        setDiagramSvg('');
        return;
      }

      try {
        // Generate unique ID for this render
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, mermaidDiagram);
        setDiagramSvg(svg);
        setDiagramError('');
      } catch (error: any) {
        console.error('Mermaid render error:', error);
        setDiagramError(error.message || 'Failed to render diagram');
        setDiagramSvg('');
      }
    };

    renderDiagram();
  }, [mermaidDiagram]);

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

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden flex flex-col">
      <div className="p-6 pb-4 flex items-center gap-2 border-b border-zinc-800">
        <GitBranch className="h-5 w-5 text-emerald-400" />
        <h2 className="font-semibold text-zinc-100">Commit History</h2>
        <span className="ml-auto text-sm text-zinc-500">
          {commits.length} commit{commits.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Mermaid Diagram - Full Width */}
      <div className="p-4 overflow-auto max-h-[300px]">
        {diagramError ? (
          <div className="text-red-400 text-sm p-4 bg-red-500/10 rounded">
            <p className="font-medium">Diagram Error:</p>
            <p className="text-xs mt-1 opacity-75">{diagramError}</p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-zinc-500">Show diagram source</summary>
              <pre className="mt-2 text-xs bg-zinc-800 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                {mermaidDiagram}
              </pre>
            </details>
          </div>
        ) : diagramSvg ? (
          <div 
            ref={diagramRef}
            className="mermaid-container w-full flex justify-center"
            dangerouslySetInnerHTML={{ __html: diagramSvg }}
          />
        ) : (
          <div className="text-zinc-500 text-center py-8">
            Loading diagram...
          </div>
        )}
      </div>

      {/* Commit List - Below the diagram */}
      <div className="border-t border-zinc-800 overflow-y-auto max-h-[300px] p-4">
        <div className="space-y-2">
          {commitsWithTags.map((commit) => (
            <div
              key={commit.id}
              className={`group p-3 rounded-lg cursor-pointer transition-all border ${
                hoveredCommitId === commit.id 
                  ? 'bg-emerald-500/20 border-emerald-500/50 ring-1 ring-emerald-500/30' 
                  : 'bg-zinc-800/30 hover:bg-zinc-800/60 border-transparent hover:border-zinc-700'
              }`}
              onClick={() => setSelectedCommit(commit)}
              onContextMenu={(e) => handleContextMenu(e, commit)}
              onMouseEnter={() => setHoveredCommitId(commit.id)}
              onMouseLeave={() => setHoveredCommitId(null)}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-zinc-200 group-hover:text-zinc-100 line-clamp-2">
                  {commit.message}
                </p>
                <code className="flex-shrink-0 rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-400 font-mono">
                  {commit.hash}
                </code>
              </div>

                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {commit.branch && (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-xs text-emerald-400 border border-emerald-500/30">
                      <GitBranch className="h-3 w-3" />
                      {commit.branch}
                    </span>
                  )}
                  
                  {commit.tags && commit.tags.map(tag => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-400 border border-amber-500/20"
                    >
                      <Tag className="h-3 w-3" />
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {commit.author}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(commit.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-md shadow-xl overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div
            className="px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 cursor-pointer transition-colors"
            onClick={() => handleMenuAction('rebase')}
          >
            Rebase
          </div>
          <div
            className="px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 cursor-pointer transition-colors"
            onClick={() => handleMenuAction('interactive-rebase')}
          >
            Interactive Rebase
          </div>
          <div
            className="px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 cursor-pointer transition-colors"
            onClick={() => handleMenuAction('merge')}
          >
            Merge Branch
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

      <style>{`
        .mermaid-container svg {
          max-width: 100%;
          height: auto;
        }
        .mermaid-container .commit-label {
          font-size: 10px !important;
        }
        .mermaid-container .branch-label {
          font-size: 12px !important;
        }
        .mermaid-container circle {
          transition: filter 0.2s ease;
        }
        .mermaid-container g {
          transition: filter 0.2s ease;
        }
      `}</style>
    </div>
  );
}
