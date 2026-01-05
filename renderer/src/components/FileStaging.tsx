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
}

export function FileStaging({ files, onToggleStage, onRevertFile, onDeleteFile }: FileStagingProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileChange } | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'modified':
        return 'text-yellow-400';
      case 'added':
        return 'text-green-400';
      case 'deleted':
        return 'text-red-400';
      default:
        return 'text-gray-400';
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

  return (
    <div className="space-y-2">
      {files.length === 0 ? (
        <div className="py-8 text-center text-zinc-500">
          <FileCheck className="mx-auto mb-2 size-8" />
          <p>No changes to commit</p>
        </div>
      ) : (
        files.map((file) => (
          <div
            key={file.path}
            className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-3 hover:bg-zinc-900/50 transition-colors cursor-pointer"
            onContextMenu={(e) => handleContextMenu(e, file)}
            onClick={() => setSelectedFile(file)}
          >
            <Checkbox
              checked={file.staged}
              onCheckedChange={() => onToggleStage(file.path)}
              className="border-zinc-600"
            />
            <span className={`font-mono ${getStatusColor(file.status)} w-4`}>
              {getStatusLabel(file.status)}
            </span>
            <span className="flex-1 font-mono text-sm">{file.path}</span>
            {file.status === 'deleted' && (
              <FileX className="size-4 text-red-400" />
            )}
          </div>
        ))
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-md shadow-xl overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.file.status === 'added' ? (
            <div
              className="px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 cursor-pointer transition-colors"
              onClick={() => handleMenuAction('delete')}
            >
              Delete file
            </div>
          ) : (
            <div
              className="px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 cursor-pointer transition-colors"
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
        />
      )}
    </div>
  );
}

