import * as pty from 'node-pty';
import * as os from 'os';
import * as path from 'path';
import { ipcMain } from 'electron';

// Map of sessionId to PTY instance
const ptySessions = new Map<string, pty.IPty>();
// Map of sessionId to PTY history output
const ptyHistory = new Map<string, string>();

// Cap history at roughly 100KB to prevent memory leaks
const MAX_HISTORY_LENGTH = 100 * 1024;

function fixPath() {
  if (os.platform() === 'win32') return process.env;

  const home = os.homedir();
  const extraPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    path.join(home, '.local', 'bin'),
    path.join(home, 'bin')
  ];

  const currentPath = process.env.PATH || '';
  const currentPaths = currentPath.split(':');
  
  const newPaths = extraPaths.filter(p => !currentPaths.includes(p));
  
  if (newPaths.length > 0) {
    return {
      ...process.env,
      PATH: [...newPaths, ...currentPaths].join(':')
    };
  }
  
  return process.env;
}

export function setupPtyIpc() {
  ipcMain.handle('pty:spawn', (event, sessionId: string, command: string, args: string[], cwd: string) => {
    try {
      if (ptySessions.has(sessionId)) {
        return { success: true, alreadyExists: true };
      }

      const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash');
      const actualCommand = command === '$SHELL' ? shell : command;
      
      const envObj = fixPath();
      const cleanEnv = Object.fromEntries(Object.entries(envObj).filter(([_, v]) => v !== undefined)) as Record<string, string>;

      const ptyProcess = pty.spawn(actualCommand, args, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: cwd || process.cwd(),
        env: cleanEnv,
      });

      ptyHistory.set(sessionId, '');

      // Buffer for throttling IPC sends
      const ptyBuffers = new Map<string, string>();
      const ptyTimers = new Map<string, NodeJS.Timeout>();

      ptyProcess.onData((data: string) => {
        // Append to history
        let currentHistory = ptyHistory.get(sessionId) || '';
        currentHistory += data;
        if (currentHistory.length > MAX_HISTORY_LENGTH) {
          currentHistory = currentHistory.substring(currentHistory.length - MAX_HISTORY_LENGTH);
        }
        ptyHistory.set(sessionId, currentHistory);

        // Throttle IPC send to prevent renderer/main process crash during large outputs
        let buffer = ptyBuffers.get(sessionId) || '';
        buffer += data;
        
        // Prevent V8 OOM by capping the pending IPC buffer to 5MB
        const MAX_PENDING_BUFFER = 5 * 1024 * 1024;
        if (buffer.length > MAX_PENDING_BUFFER) {
           buffer = buffer.substring(buffer.length - MAX_PENDING_BUFFER);
        }
        
        ptyBuffers.set(sessionId, buffer);

        if (!ptyTimers.has(sessionId)) {
          const sendChunk = () => {
            let chunk = ptyBuffers.get(sessionId) || '';
            const MAX_IPC_CHUNK_SIZE = 100 * 1024;
            
            let toSend = chunk;
            let hasMore = false;
            if (chunk.length > MAX_IPC_CHUNK_SIZE) {
               toSend = chunk.substring(0, MAX_IPC_CHUNK_SIZE);
               ptyBuffers.set(sessionId, chunk.substring(MAX_IPC_CHUNK_SIZE));
               hasMore = true;
            } else {
               ptyBuffers.delete(sessionId);
            }
            
            if (toSend && !event.sender.isDestroyed()) {
              event.sender.send(`pty:data:${sessionId}`, toSend);
            }
            
            if (hasMore) {
              ptyTimers.set(sessionId, setTimeout(sendChunk, 16));
            } else {
              ptyTimers.delete(sessionId);
            }
          };
          
          ptyTimers.set(sessionId, setTimeout(sendChunk, 16));
        }
      });

      ptyProcess.onExit(({ exitCode, signal }: { exitCode: number, signal?: number }) => {
        if (ptySessions.get(sessionId) === ptyProcess) {
          if (!event.sender.isDestroyed()) {
            event.sender.send(`pty:exit:${sessionId}`, { exitCode, signal });
          }
          ptySessions.delete(sessionId);
          // Keep history even if process exited, until explicitly killed/cleared
        }
      });

      ptySessions.set(sessionId, ptyProcess);
      return { success: true };
    } catch (error: any) {
      console.error(`Failed to spawn PTY for session ${sessionId}:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pty:write', (event, sessionId: string, data: string) => {
    const ptyProcess = ptySessions.get(sessionId);
    if (ptyProcess) {
      ptyProcess.write(data);
      return { success: true };
    }
    return { success: false, error: 'PTY session not found' };
  });

  ipcMain.handle('pty:resize', (event, sessionId: string, cols: number, rows: number) => {
    const ptyProcess = ptySessions.get(sessionId);
    if (ptyProcess) {
      ptyProcess.resize(cols, rows);
      return { success: true };
    }
    return { success: false, error: 'PTY session not found' };
  });

  ipcMain.handle('pty:kill', (event, sessionId: string) => {
    ptyHistory.delete(sessionId);
    const ptyProcess = ptySessions.get(sessionId);
    if (ptyProcess) {
      ptyProcess.kill();
      ptySessions.delete(sessionId);
      return { success: true };
    }
    return { success: false, error: 'PTY session not found' };
  });

  ipcMain.handle('pty:restore', (event, sessionId: string) => {
    return { success: true, data: ptyHistory.get(sessionId) || '' };
  });

  ipcMain.handle('pty:exists', (event, sessionId: string) => {
    return { success: true, exists: ptySessions.has(sessionId) };
  });
}
