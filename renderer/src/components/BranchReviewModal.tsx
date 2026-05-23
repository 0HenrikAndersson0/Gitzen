import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { DiffViewer } from './DiffViewer/DiffViewer';
import { parseDiff } from '../lib/diffUtils';
import { 
  Sparkles, 
  GitBranch, 
  ChevronRight, 
  ChevronDown, 
  FileText, 
  FilePlus, 
  FileX, 
  RefreshCw, 
  Loader2, 
  AlertCircle 
} from 'lucide-react';

interface FileDiffItem {
  path: string;
  status: 'modified' | 'added' | 'deleted';
  additions: number;
  deletions: number;
  diff: string;
}

interface BranchReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  branchName: string;
}

export function BranchReviewModal({ isOpen, onClose, branchName }: BranchReviewModalProps) {
  const [baseBranch, setBaseBranch] = useState('main');
  const [files, setFiles] = useState<FileDiffItem[]>([]);
  const [summary, setSummary] = useState('');
  const [explanation, setExplanation] = useState('');
  
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [errorDiff, setErrorDiff] = useState('');
  const [errorAI, setErrorAI] = useState('');
  
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

  const loadDiff = useCallback(async () => {
    setLoadingDiff(true);
    setErrorDiff('');
    try {
      const result = await window.electronAPI.gitGetBranchDiff(branchName);
      if (result.success) {
        setFiles(result.files || []);
        setBaseBranch(result.baseBranch || 'main');
        
        // Auto-expand the first file if there is one
        if (result.files && result.files.length > 0) {
          setExpandedFiles({ [result.files[0].path]: true });
        }
      } else {
        setErrorDiff(result.error || 'Failed to load branch diffs');
      }
    } catch (e: any) {
      setErrorDiff(e.message || 'An unexpected error occurred while loading files');
    } finally {
      setLoadingDiff(false);
    }
  }, [branchName]);

  const loadAIReview = useCallback(async () => {
    setLoadingAI(true);
    setErrorAI('');
    setSummary('');
    setExplanation('');
    try {
      const result = await window.electronAPI.gitGetAIBranchReview(branchName);
      if (result.success) {
        setSummary(result.summary || '');
        setExplanation(result.explanation || '');
      } else {
        setErrorAI(result.error || 'Failed to generate AI review');
      }
    } catch (e: any) {
      setErrorAI(e.message || 'An unexpected error occurred during AI analysis');
    } finally {
      setLoadingAI(false);
    }
  }, [branchName]);

  useEffect(() => {
    if (isOpen && branchName) {
      loadDiff();
      loadAIReview();
    }
  }, [isOpen, branchName, loadDiff, loadAIReview]);

  const toggleFileExpanded = (path: string) => {
    setExpandedFiles(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  const getFileIcon = (status: FileDiffItem['status']) => {
    switch (status) {
      case 'added':
        return <FilePlus className="size-4 text-emerald-500" />;
      case 'deleted':
        return <FileX className="size-4 text-red-500" />;
      default:
        return <FileText className="size-4 text-zinc-400" />;
    }
  };

  // Inline markdown rendering helper
  const renderMarkdown = (text: string) => {
    if (!text) return null;
    
    // Simple state-less block parser
    const lines = text.split('\n');
    let insideCodeBlock = false;
    let codeLines: string[] = [];

    const parsedElements: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // Code Block boundaries
      if (trimmed.startsWith('```')) {
        if (insideCodeBlock) {
          // Close block
          parsedElements.push(
            <pre key={`code-${index}`} className="my-3 p-3 rounded bg-zinc-950 font-mono text-xs text-zinc-300 overflow-x-auto border border-border/40 select-text">
              <code>{codeLines.join('\n')}</code>
            </pre>
          );
          codeLines = [];
          insideCodeBlock = false;
        } else {
          insideCodeBlock = true;
        }
        return;
      }

      if (insideCodeBlock) {
        codeLines.push(line);
        return;
      }

      // Headers
      if (trimmed.startsWith('### ')) {
        parsedElements.push(
          <h4 key={index} className="text-xs font-semibold text-foreground tracking-wide uppercase mt-4 mb-2">
            {parseInlineMarkdown(trimmed.substring(4))}
          </h4>
        );
        return;
      }
      if (trimmed.startsWith('## ')) {
        parsedElements.push(
          <h3 key={index} className="text-sm font-bold text-foreground border-b border-border/40 pb-1 mt-5 mb-2.5">
            {parseInlineMarkdown(trimmed.substring(3))}
          </h3>
        );
        return;
      }
      if (trimmed.startsWith('# ')) {
        parsedElements.push(
          <h2 key={index} className="text-base font-extrabold text-foreground border-b border-border pb-1.5 mt-6 mb-3">
            {parseInlineMarkdown(trimmed.substring(2))}
          </h2>
        );
        return;
      }

      // Bullet Lists
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        parsedElements.push(
          <li key={index} className="list-disc ml-5 mb-1.5 text-xs text-foreground/80 leading-relaxed">
            {parseInlineMarkdown(trimmed.substring(2))}
          </li>
        );
        return;
      }

      // Numbered Lists
      const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (numMatch) {
        parsedElements.push(
          <li key={index} className="list-decimal ml-5 mb-1.5 text-xs text-foreground/80 leading-relaxed">
            {parseInlineMarkdown(numMatch[2])}
          </li>
        );
        return;
      }

      // Horizontal rules
      if (trimmed === '---') {
        parsedElements.push(<hr key={index} className="my-4 border-border/40" />);
        return;
      }

      // Blank line
      if (!trimmed) {
        parsedElements.push(<div key={index} className="h-2" />);
        return;
      }

      // Paragraph
      parsedElements.push(
        <p key={index} className="text-xs text-foreground/80 leading-relaxed mb-2">
          {parseInlineMarkdown(line)}
        </p>
      );
    });

    return parsedElements;
  };

  const parseInlineMarkdown = (text: string): React.ReactNode[] => {
    // Splits text into bold (**), code (`), and regular text
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={idx} className="px-1.5 py-0.5 rounded bg-zinc-950 font-mono text-[10px] text-emerald-400 select-all border border-border/30">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-border max-w-7xl w-[95vw] h-[90vh] flex flex-col p-6 gap-4 overflow-hidden rounded-lg shadow-2xl">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 animate-pulse">
              <Sparkles className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold flex items-center gap-2 text-foreground">
                Review Changes
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground font-mono flex items-center gap-1.5 mt-0.5">
                <GitBranch className="size-3.5" /> {branchName} 
                <span className="text-zinc-500">&rarr;</span> 
                <GitBranch className="size-3.5 text-zinc-400" /> {baseBranch}
              </DialogDescription>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { loadDiff(); loadAIReview(); }}
              disabled={loadingDiff || loadingAI}
              className="h-8 text-xs bg-secondary border-border text-foreground hover:bg-muted font-medium"
            >
              {(loadingDiff || loadingAI) ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5 mr-1.5" />
              )}
              Retry Analysis
            </Button>
          </div>
        </DialogHeader>

        {/* Modal Scrollable Body */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
          {/* Summary Box */}
          <div className="bg-gradient-to-r from-emerald-500/5 to-violet-500/5 rounded-lg border border-emerald-500/15 p-4 shrink-0 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
            <h3 className="text-xs font-semibold text-emerald-400 flex items-center gap-2 mb-2 uppercase tracking-wider">
              <Sparkles className="size-3.5" /> AI Summary & Intended Purpose
            </h3>
            {loadingAI ? (
              <div className="space-y-2 py-1 animate-pulse">
                <div className="h-3.5 bg-muted rounded w-3/4" />
                <div className="h-3.5 bg-muted rounded w-5/6" />
                <div className="h-3.5 bg-muted rounded w-2/3" />
              </div>
            ) : errorAI ? (
              <div className="flex items-center gap-2.5 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-red-400">
                <AlertCircle className="size-4 shrink-0" />
                <div>
                  <span className="font-semibold">AI analysis error:</span> {errorAI}
                  <p className="mt-1 text-[10px] text-zinc-500">Ensure you have a supported AI tool like `gemini` or `claude` installed and set up in your system PATH.</p>
                </div>
              </div>
            ) : summary ? (
              <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed text-foreground/90 font-medium">
                {renderMarkdown(summary)}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-2 italic">Generating summary...</div>
            )}
          </div>

          {/* Two Pane Layout */}
          <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
            {/* Left Pane: Detailed Explanation */}
            <div className="w-[38%] rounded-lg border border-border bg-card/40 flex flex-col overflow-hidden">
              <div className="border-b border-border bg-muted/20 px-4 py-2.5 flex items-center gap-2 shrink-0">
                <Sparkles className="size-3.5 text-emerald-400" />
                <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">Detailed Explanation</h3>
              </div>
              <ScrollArea className="flex-1 p-4">
                {loadingAI ? (
                  <div className="space-y-4 animate-pulse">
                    <div className="space-y-2">
                      <div className="h-4 bg-muted rounded w-1/3" />
                      <div className="h-3.5 bg-muted rounded w-full" />
                      <div className="h-3.5 bg-muted rounded w-5/6" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 bg-muted rounded w-1/4" />
                      <div className="h-3.5 bg-muted rounded w-full" />
                      <div className="h-3.5 bg-muted rounded w-4/5" />
                    </div>
                  </div>
                ) : explanation ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed text-foreground/80">
                    {renderMarkdown(explanation)}
                  </div>
                ) : errorAI ? (
                  <div className="text-xs text-muted-foreground italic py-4">AI analysis was not successful. Please refer to the error notice above.</div>
                ) : (
                  <div className="text-xs text-muted-foreground italic py-4">Generating technical overview...</div>
                )}
              </ScrollArea>
            </div>

            {/* Right Pane: Code Diffs */}
            <div className="flex-1 rounded-lg border border-border bg-card/40 flex flex-col overflow-hidden">
              <div className="border-b border-border bg-muted/20 px-4 py-2 flex items-center justify-between shrink-0">
                <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">Changed Files & Code Diffs</h3>
                <div className="flex rounded-md border border-border bg-secondary p-0.5 h-7">
                  <button
                    onClick={() => setViewMode('split')}
                    className={`rounded px-2 text-[10px] font-medium transition-colors ${
                      viewMode === 'split'
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Side-by-Side
                  </button>
                  <button
                    onClick={() => setViewMode('unified')}
                    className={`rounded px-2 text-[10px] font-medium transition-colors ${
                      viewMode === 'unified'
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Unified
                  </button>
                </div>
              </div>

              {/* Diffs Area */}
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  {loadingDiff ? (
                    <div className="text-center text-xs text-muted-foreground py-12 flex flex-col items-center gap-2">
                      <Loader2 className="size-6 animate-spin text-zinc-500" />
                      Loading code diffs...
                    </div>
                  ) : errorDiff ? (
                    <div className="flex items-center gap-2.5 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-red-400">
                      <AlertCircle className="size-4 shrink-0" />
                      <div>{errorDiff}</div>
                    </div>
                  ) : files.length === 0 ? (
                    <div className="text-center text-xs text-muted-foreground py-12 italic border border-dashed border-border rounded-lg bg-card/20">
                      No files changed on this branch relative to {baseBranch}.
                    </div>
                  ) : (
                    files.map((file) => {
                      const isExpanded = !!expandedFiles[file.path];
                      return (
                        <div key={file.path} className="border border-border rounded-lg overflow-hidden bg-card/60">
                          {/* File Accordion Header */}
                          <div 
                            onClick={() => toggleFileExpanded(file.path)}
                            className="flex items-center justify-between px-3.5 py-2.5 hover:bg-muted/40 cursor-pointer select-none transition-colors border-b border-transparent data-[expanded=true]:border-border"
                            data-expanded={isExpanded}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {getFileIcon(file.status)}
                              <span className="font-mono text-xs font-semibold truncate text-foreground/90">{file.path}</span>
                              <span className={`text-[10px] rounded px-1.5 py-0.5 capitalize border ${
                                file.status === 'added' 
                                  ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/25' 
                                  : file.status === 'deleted' 
                                    ? 'bg-red-500/5 text-red-400 border-red-500/25' 
                                    : 'bg-zinc-500/5 text-zinc-400 border-zinc-500/25'
                              }`}>
                                {file.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 ml-2 flex-shrink-0">
                              <span className="font-mono text-[10px] font-medium flex items-center gap-1.5">
                                <span className="text-emerald-500">+{file.additions}</span>
                                <span className="text-red-500">-{file.deletions}</span>
                              </span>
                              {isExpanded ? (
                                <ChevronDown className="size-4 text-zinc-500" />
                              ) : (
                                <ChevronRight className="size-4 text-zinc-500" />
                              )}
                            </div>
                          </div>

                          {/* File Accordion Diff Viewer */}
                          {isExpanded && (
                            <div className="bg-zinc-950/20 border-t border-border flex flex-col p-2.5">
                              {file.diff ? (
                                <DiffViewer 
                                  hunks={parseDiff(file.diff).hunks} 
                                  viewMode={viewMode} 
                                  readOnly={true} 
                                />
                              ) : (
                                <div className="text-center py-4 text-[11px] text-muted-foreground italic">No diff details available</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-border pt-3 shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="h-9 text-xs bg-secondary border-border text-foreground hover:bg-muted font-semibold px-6"
          >
            Close Review
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
