import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface AgentTerminalProps {
  sessionId: string;
  command: string;
  args: string[];
  cwd: string;
  initialInput?: string;
  onExit?: (exitCode: number) => void;
  className?: string;
}

export const AgentTerminal: React.FC<AgentTerminalProps> = ({
  sessionId,
  command,
  args,
  cwd,
  initialInput,
  onExit,
  className = '',
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#09090b', // Tailwind zinc-950 or card
        foreground: '#fafafa', // Tailwind zinc-50
        cursor: '#fafafa',
        selectionBackground: '#3f3f46', // zinc-700
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle user input
    const disposable = term.onData((data) => {
      window.electronAPI.ptyWrite(sessionId, data);
    });

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
      window.electronAPI.ptyResize(sessionId, term.cols, term.rows);
    };
    window.addEventListener('resize', handleResize);

    // Spawn PTY process
    const initPty = async () => {
      const result = await window.electronAPI.ptySpawn(sessionId, command, args, cwd);
      if (result.success) {
        setIsReady(true);
        
        if (result.alreadyExists) {
          // Restore history
          const restoreResult = await window.electronAPI.ptyRestore(sessionId);
          if (restoreResult.success && restoreResult.data) {
            term.write(restoreResult.data);
          }
        }
        
        // Initial resize
        window.electronAPI.ptyResize(sessionId, term.cols, term.rows);
        
        // Send initial input if provided, with a slight delay so shell is ready
        if (initialInput && !result.alreadyExists) {
          setTimeout(() => {
            window.electronAPI.ptyWrite(sessionId, initialInput);
          }, 500);
        }
      } else {
        term.writeln(`\x1b[31mError spawning PTY: ${result.error}\x1b[0m`);
      }
    };

    initPty();

    // Listen for PTY output
    const cleanupPtyData = window.electronAPI.onPtyData(sessionId, (data) => {
      term.write(data);
    });

    // Listen for PTY exit
    const cleanupPtyExit = window.electronAPI.onPtyExit(sessionId, ({ exitCode }) => {
      console.log('PTY Exited:', exitCode);
      term.writeln(`\r\n\x1b[33m[Process exited with code ${exitCode}]\x1b[0m`);
      if (onExit) onExit(exitCode);
    });

    return () => {
      disposable.dispose();
      window.removeEventListener('resize', handleResize);
      cleanupPtyData();
      cleanupPtyExit();
      // Do not kill the PTY on unmount so it persists when switching views
      term.dispose();
    };
  }, [sessionId, command, args, cwd]);

  return (
    <div className={`h-full w-full overflow-hidden ${className}`}>
      <div ref={terminalRef} className="h-full w-full p-2 bg-zinc-950 rounded-md" />
    </div>
  );
};
