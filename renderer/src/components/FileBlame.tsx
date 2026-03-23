import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface FileBlameProps {
  filePath: string;
}

export function FileBlame({ filePath }: FileBlameProps) {
  const [blameData, setBlameData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadBlame() {
      setLoading(true);
      setError(null);
      try {
        const result = await window.electronAPI.getFileBlame(filePath);
        if (result.success && result.blame) {
          setBlameData(result.blame);
        } else {
          setError(result.error || 'Failed to load blame data');
        }
      } catch (e: any) {
        setError(e.message || 'Error fetching blame');
      } finally {
        setLoading(false);
      }
    }

    if (filePath) {
      loadBlame();
    }
  }, [filePath]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading blame...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-500 bg-red-500/10 rounded-md m-4">
        {error}
      </div>
    );
  }

  return (
    <div className="font-mono text-sm overflow-auto h-full w-full bg-background border border-border rounded-md">
      <table className="w-full border-collapse">
        <tbody>
          {blameData.map((line, index) => (
            <tr key={`${line.lineNumber}-${index}`} className="hover:bg-accent/50 group">
              <td className="py-0.5 px-2 text-muted-foreground border-r border-border whitespace-nowrap select-none min-w-[320px] bg-muted/30">
                <span className="inline-block w-20 truncate align-bottom text-primary/80 mr-2" title={line.commitHash}>{line.commitHash}</span>
                <span className="inline-block w-24 truncate align-bottom mr-2" title={line.author}>{line.author}</span>
                <span className="inline-block w-24 truncate align-bottom opacity-70" title={line.date}>{line.date}</span>
              </td>
              <td className="py-0.5 px-2 text-muted-foreground border-r border-border select-none text-right w-12 bg-muted/10">
                {line.lineNumber}
              </td>
              <td className="py-0.5 px-4 whitespace-pre group-hover:bg-accent/30 text-foreground">
                {line.content || ' '}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
