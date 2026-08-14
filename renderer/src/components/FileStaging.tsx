import { useState, useRef, useEffect } from 'react';
import { Checkbox } from './ui/checkbox';
import { FileCheck, FileX } from 'lucide-react';
import { FileDiff } from './FileDiff';

interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted';
  staged: boolean;
}

interface FileStagingProps {
  files: FileChange[];
  onStageFiles?: (paths: string[]) => void;
  onUnstageFiles?: (paths: string[]) => void;
  onRevertFiles?: (paths: string[]) => void;
  onStashFiles?: (paths: string[]) => void;
  onRevertFile?: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  onRefresh?: () => void;
  selectedFileIndex?: number;
  selectedPaths?: Set<string>;
  onSelectionChange?: (paths: Set<string>) => void;
}

export function FileStaging({ files, onStageFiles, onUnstageFiles, onRevertFiles, onStashFiles, onRevertFile, onDeleteFile, onRefresh, selectedFileIndex, selectedPaths: externalSelectedPaths, onSelectionChange }: FileStagingProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileChange } | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null);
  const [internalSelectedPaths, setInternalSelectedPaths] = useState<Set<string>>(new Set());
const selectedPaths = externalSelectedPaths !== undefined ? externalSelectedPaths : internalSelectedPaths;
const setSelectedPaths = (paths: Set<string>) => {
  if (externalSelectedPaths === undefined) {
    setInternalSelectedPaths(paths);
  }
  onSelectionChange?.(paths);
};
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Update selectedFile when files change to keep diff view in sync
  useEffect(() => {
    if (selectedFile) {
      const updatedFile = files.find(f => f.path === selectedFile.path);
      if (updatedFile && updatedFile !== selectedFile) {
        setSelectedFile(updatedFile);
      } else if (!updatedFile) {
        setSelectedFile(null);
      }
    }
  }, [files, selectedFile]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedFileIndex !== undefined && selectedFileIndex >= 0 && selectedFileIndex < files.length) {
      itemRefs.current[selectedFileIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedFileIndex, files.length]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'modified':
        return 'text-warning';
      case 'added':
        return 'text-success';
      case 'deleted':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'modified':
        return 'M';
      case 'added':
        return 'A';
      case 'deleted':
        return 'D';
      default:
        return '?';
    }
  };

  const handleContextMenu = (e: React.MouseEvent, file: FileChange) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      file,
    });
  };

  const handleMenuAction = (action: 'revert' | 'delete' | 'open' | 'stage' | 'unstage' | 'stash') => {
    if (!contextMenu) return;

    const file = contextMenu.file;
    const targets = selectedPaths.has(file.path) ? Array.from(selectedPaths) : [file.path];

    if (action === 'stage' && onStageFiles) {
      onStageFiles(targets);
      setSelectedPaths(new Set());
    } else if (action === 'unstage' && onUnstageFiles) {
      onUnstageFiles(targets);
      setSelectedPaths(new Set());
    } else if (action === 'revert') {
      if (onRevertFiles) {
        onRevertFiles(targets);
      } else if (onRevertFile) {
        targets.forEach(t => onRevertFile(t));
      }
      setSelectedPaths(new Set());
    } else if (action === 'stash' && onStashFiles) {
      onStashFiles(targets);
      setSelectedPaths(new Set());
    } else if (action === 'delete' && onDeleteFile) {
      targets.forEach(t => onDeleteFile(t));
      setSelectedPaths(new Set());
    } else if (action === 'open') {
      targets.forEach(t => (window as any).electronAPI.openFileInDefaultEditor(t));
    }
    setContextMenu(null);
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [contextMenu]);

  const handleNextFile = () => {
    if (!selectedFile) return;
    const currentIndex = files.findIndex(f => f.path === selectedFile.path);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + 1) % files.length;
    setSelectedFile(files[nextIndex]);
  };

  const handlePrevFile = () => {
    if (!selectedFile) return;
    const currentIndex = files.findIndex(f => f.path === selectedFile.path);
    if (currentIndex === -1) return;
    const prevIndex = (currentIndex - 1 + files.length) % files.length;
    setSelectedFile(files[prevIndex]);
  };

  return (
    <div className="space-y-2">
      {files.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          <FileCheck className="mx-auto mb-2 size-8" />
          <p>No changes to commit</p>
        </div>
      ) : (
        files.map((file, index) => (
            <div
              key={file.path}
              ref={(el) => { itemRefs.current[index] = el; }}
              className={`flex items-center gap-3 rounded-md border p-3 transition-colors cursor-pointer ${
                  selectedPaths.has(file.path)
                    ? 'border-primary bg-primary/10'
                    : selectedFileIndex === index
                      ? 'border-border bg-accent'
                      : 'border-border bg-background/50 hover:bg-card/50'
                }`}
              onContextMenu={(e) => handleContextMenu(e, file)}
              onClick={(e) => {
                e.preventDefault();
                setSelectedFile(file);
              }}
            >
            <Checkbox
              checked={selectedPaths.has(file.path)}
              onCheckedChange={(checked) => {
                const newPaths = new Set(selectedPaths);
                if (checked) {
                  newPaths.add(file.path);
                } else {
                  newPaths.delete(file.path);
                }
                setSelectedPaths(newPaths);
                setLastSelectedIndex(index);
              }}
              onClick={(e) => e.stopPropagation()}
              className="border-border"
            />
<span className={`font-mono ${getStatusColor(file.status)} w-4`}>
  {getStatusLabel(file.status)}
</span>
<div className="flex-1 flex items-center gap-2 min-w-0">
  <span className="font-mono text-sm truncate">{file.path}</span>
  {file.staged && (
    <span className="flex-none text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
      Staged
    </span>
  )}
</div>
{file.status === 'deleted' && (
  <FileX className="flex-none size-4 text-destructive" />
)}
          </div>
        ))
      )}

      {/* Context Menu */}
      {contextMenu && (() => {
        const targetsCount = selectedPaths.has(contextMenu.file.path) ? selectedPaths.size : 1;
        const countStr = targetsCount > 1 ? ` (${targetsCount})` : '';

        return (
          <div
            ref={menuRef}
            className="fixed z-50 bg-secondary border border-border rounded-md shadow-xl overflow-hidden"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div
              className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors border-b border-border/50"
              onClick={() => handleMenuAction('open')}
            >
              Open in Default Editor
            </div>
            <div
              className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors"
              onClick={() => handleMenuAction('stage')}
            >
              Stage{countStr}
            </div>
            <div
              className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors"
              onClick={() => handleMenuAction('unstage')}
            >
              Unstage{countStr}
            </div>
            <div
              className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors"
              onClick={() => handleMenuAction('stash')}
            >
              Stash{countStr}
            </div>
            {contextMenu.file.status === 'added' ? (
              <div
                className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors"
                onClick={() => handleMenuAction('delete')}
              >
                Delete file{countStr}
              </div>
            ) : (
              <div
                className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors"
                onClick={() => handleMenuAction('revert')}
              >
                Revert changes{countStr}
              </div>
            )}
          </div>
        );
      })()}

      {/* File Diff Modal */}
      {selectedFile && (
        <FileDiff
          file={selectedFile}
          onClose={() => setSelectedFile(null)}
          onRefresh={onRefresh || (() => { })}
          onNext={files.length > 1 ? handleNextFile : undefined}
          onPrevious={files.length > 1 ? handlePrevFile : undefined}
        />
      )}
    </div>
  );
}
