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
  watcher = chokidar.watch(repoPath, {
    ignored: [
      '**/.git/objects/**',
      '**/.git/index.lock',
      '**/.git/COMMIT_EDITMSG',
      '**/.git/FETCH_HEAD',
      '**/.git/ORIG_HEAD',
      '**/.git/logs/**', // Avoid noise from detailed logs
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.DS_Store',
    ],
    persistent: true,
    ignoreInitial: true,
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
