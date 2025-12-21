import { Checkbox } from './ui/checkbox';
import { FileCheck, FileX } from 'lucide-react';

interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted';
  staged: boolean;
}

interface FileStagingProps {
  files: FileChange[];
  onToggleStage: (path: string) => void;
}

export function FileStaging({ files, onToggleStage }: FileStagingProps) {
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
            className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-3 hover:bg-zinc-900/50 transition-colors"
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
    </div>
  );
}

