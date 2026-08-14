import * as pty from 'node-pty';
import * as os from 'os';
import { ipcMain } from 'electron';

// Map of sessionId to PTY instance
const ptySessions = new Map<string, pty.IPty>();
// Map of sessionId to PTY history output
const ptyHistory = new Map<string, string>();

// Cap history at roughly 100KB to prevent memory leaks
const MAX_HISTORY_LENGTH = 100 * 1024;

export function setupPtyIpc() {
  ipcMain.handle('pty:spawn', (event, sessionId: string, command: string, args: string[], cwd: string) => {
    try {
      if (ptySessions.has(sessionId)) {
        return { success: true, alreadyExists: true };
      }

      const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash');
      const actualCommand = command === '$SHELL' ? shell : command;
      
      const ptyProcess = pty.spawn(actualCommand, args, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: cwd || process.cwd(),
        env: Object.fromEntries(Object.entries(process.env).filter(([_, v]) => v !== undefined)) as Record<string, string>,
      });

      ptyHistory.set(sessionId, '');

      ptyProcess.onData((data) => {
        // Append to history
        let currentHistory = ptyHistory.get(sessionId) || '';
        currentHistory += data;
        if (currentHistory.length > MAX_HISTORY_LENGTH) {
          currentHistory = currentHistory.substring(currentHistory.length - MAX_HISTORY_LENGTH);
        }
        ptyHistory.set(sessionId, currentHistory);

        // Send to any active listeners
        event.sender.send(`pty:data:${sessionId}`, data);
      });

      ptyProcess.onExit(({ exitCode, signal }) => {
        if (ptySessions.get(sessionId) === ptyProcess) {
          event.sender.send(`pty:exit:${sessionId}`, { exitCode, signal });
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
