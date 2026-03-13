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
  onToggleStage: (path: string) => void;
  onRevertFile?: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  onRefresh?: () => void;
  selectedFileIndex?: number;
}

export function FileStaging({ files, onToggleStage, onRevertFile, onDeleteFile, onRefresh, selectedFileIndex }: FileStagingProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileChange } | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null);
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

  const handleMenuAction = (action: 'revert' | 'delete') => {
    if (!contextMenu) return;

    const file = contextMenu.file;
    if (action === 'revert' && onRevertFile) {
      onRevertFile(file.path);
    } else if (action === 'delete' && onDeleteFile) {
      onDeleteFile(file.path);
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
            ref={(el) => (itemRefs.current[index] = el)}
            className={`flex items-center gap-3 rounded-md border p-3 transition-colors cursor-pointer ${selectedFileIndex === index
                ? 'border-border bg-accent'
                : 'border-border bg-background/50 hover:bg-card/50'
              }`}
            onContextMenu={(e) => handleContextMenu(e, file)}
            onClick={() => setSelectedFile(file)}
          >
            <Checkbox
              checked={file.staged}
              onCheckedChange={() => onToggleStage(file.path)}
              onClick={(e) => e.stopPropagation()}
              className="border-border"
            />
            <span className={`font-mono ${getStatusColor(file.status)} w-4`}>
              {getStatusLabel(file.status)}
            </span>
            <span className="flex-1 font-mono text-sm truncate min-w-0">{file.path}</span>
            {file.status === 'deleted' && (
              <FileX className="size-4 text-destructive" />
            )}
          </div>
        ))
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-xl overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.file.status === 'added' ? (
            <div
              className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors"
              onClick={() => handleMenuAction('delete')}
            >
              Delete file
            </div>
          ) : (
            <div
              className="px-4 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors"
              onClick={() => handleMenuAction('revert')}
            >
              Revert changes
            </div>
          )}
        </div>
      )}

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
