import * as chokidar from 'chokidar';
import * as path from 'path';
import { BrowserWindow } from 'electron';

let watcher: chokidar.FSWatcher | null = null;
let currentWatchedPath: string | null = null;

/**
 * Watches a repository's .git directory for changes and notifies the renderer.
 * This replaces the inefficient 10-second polling.
 */
export function watchRepo(repoPath: string, window: BrowserWindow) {
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  const gitDir = path.join(repoPath, '.git');
  currentWatchedPath = repoPath;

  // Watch the entire repository, including .git, but ignore noisy/large directories
  // Using a function for 'ignored' is often more reliable in chokidar v4 for preventing EMFILE errors
  watcher = chokidar.watch(repoPath, {
    ignored: (p) => {
      // Ignore git objects and logs which can contain thousands of files
      if (p.includes(path.join('.git', 'objects')) || p.includes(path.join('.git', 'logs'))) return true;
      // Ignore lock files and temp files
      if (p.endsWith('.lock') || p.endsWith('COMMIT_EDITMSG') || p.endsWith('FETCH_HEAD') || p.endsWith('ORIG_HEAD')) return true;
      // Ignore large dependency and build folders
      if (p.includes('node_modules') || p.includes('dist') || p.includes('build') || p.includes('release')) return true;
      // Ignore system files
      if (p.includes('.DS_Store')) return true;
      return false;
    },
    persistent: true,
    ignoreInitial: true,
    depth: 99, // Limit depth if necessary, but 99 is usually fine if ignored works
  });

  // Debounce notification to avoid spamming refreshes during rapid changes (like rebase or heavy staging)
  let debounceTimer: NodeJS.Timeout | null = null;
  const notifyChange = (filePath: string) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    debounceTimer = setTimeout(() => {
      console.log(`[WATCHER] Notifying renderer of change in: ${filePath}`);
      if (!window.isDestroyed()) {
        window.webContents.send('git:repo-changed', { path: filePath });
      }
      debounceTimer = null;
    }, 200); // 200ms debounce
  };

  watcher
    .on('add', (p) => notifyChange(p))
    .on('change', (p) => notifyChange(p))
    .on('unlink', (p) => notifyChange(p))
    .on('error', (error) => console.error(`[WATCHER] Error: ${error}`));

  console.log(`[WATCHER] Started watching ${repoPath}`);
}

export function stopWatching() {
  if (watcher) {
    watcher.close();
    watcher = null;
    currentWatchedPath = null;
  }
}
