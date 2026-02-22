import { Terminal } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

interface LogEntry {
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

interface ActivityLogProps {
  logs: LogEntry[];
}

export function ActivityLog({ logs }: ActivityLogProps) {
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
      case 'warning':
        return 'text-yellow-400';
      default:
        return 'text-muted-foreground';
    }
  };

  const getTypePrefix = (type: string) => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✗';
      case 'warning':
        return '⚠';
      default:
        return '→';
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card/50 p-6 flex flex-col h-full overflow-hidden">
      <div className="mb-4 flex items-center gap-2 flex-none">
        <Terminal className="size-5 text-purple-400" />
        <h2 className="font-semibold">Activity Log</h2>
      </div>

      <ScrollArea className="flex-1 rounded-md border border-border bg-background p-3 min-h-0">
        <div className="space-y-1 font-mono text-sm">
          {logs.length === 0 ? (
            <div className="text-muted-foreground">No activity yet...</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="flex gap-2">
                <span className="text-muted-foreground">
                  {log.timestamp.toLocaleTimeString()}
                </span>
                <span className={getTypeColor(log.type)}>
                  {getTypePrefix(log.type)}
                </span>
                <span className={getTypeColor(log.type)}>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

