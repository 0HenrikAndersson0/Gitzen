import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export interface BlameLine {
  commitHash: string;
  author: string;
  date: string;
  lineNo: number;
  content: string;
}

interface BlameViewerProps {
  filePath: string;
}

export function BlameViewer({ filePath }: BlameViewerProps) {
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<BlameLine[]>([]);

  useEffect(() => {
    const fetchBlame = async () => {
      setLoading(true);
      try {
        const result = await (window as any).electronAPI.getFileBlame(filePath);
        if (result.success && result.blame) {
          setLines(result.blame);
        } else {
          toast.error(result.error || 'Failed to fetch blame');
        }
      } catch (err) {
        toast.error('Error fetching file blame');
      } finally {
        setLoading(false);
      }
    };
    fetchBlame();
  }, [filePath]);

  if (loading) {
    return (
      <div className="p-4 flex flex-1 justify-center text-muted-foreground items-center">
        Loading blame data...
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="p-4 flex flex-1 justify-center text-muted-foreground items-center">
        No blame data available for this file. It may be a newly added file.
      </div>
    );
  }

  return (
    <div className="flex w-full h-full flex-col overflow-auto bg-background text-sm font-mono leading-snug">
      <table className="w-full border-collapse tabular-nums whitespace-pre">
        <colgroup>
          <col className="w-[90px] min-w-[90px] border-r border-border" />
          <col className="w-[130px] min-w-[130px] border-r border-border" />
          <col className="w-[100px] min-w-[100px] border-r border-border" />
          <col className="w-[50px] min-w-[50px] border-r border-border bg-muted/10 text-right" />
          <col className="w-auto" />
        </colgroup>
        <tbody>
          {lines.map((line, idx) => {
            const isUncommitted = /^[0]+$/.test(line.commitHash);
            const dateStr = isUncommitted 
              ? 'Uncommitted' 
              : new Date(line.date).toLocaleDateString(undefined, { 
                  month: 'short', day: '2-digit', year: 'numeric' 
                });
            
            return (
              <tr key={idx} className="group hover:bg-muted/30 hover:text-foreground">
                <td className="px-2 py-[2px] text-xs text-muted-foreground/80 truncate cursor-not-allowed select-none" title={line.commitHash}>
                  {isUncommitted ? 'Not Committed' : line.commitHash.substring(0, 8)}
                </td>
                <td className="px-2 py-[2px] text-xs text-muted-foreground/80 truncate text-emerald-600 dark:text-emerald-400 select-none" title={line.author}>
                  {isUncommitted ? 'You' : line.author}
                </td>
                <td className="px-2 py-[2px] text-xs text-muted-foreground/60 whitespace-nowrap select-none">
                  {dateStr}
                </td>
                <td className="px-2 py-[2px] text-xs text-muted-foreground/40 text-right select-none border-r border-transparent group-hover:border-border">
                  {line.lineNo}
                </td>
                <td className="px-4 py-[2px] text-foreground font-mono">
                  {line.content || ' '}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
