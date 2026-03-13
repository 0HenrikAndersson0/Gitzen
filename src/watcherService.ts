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

  // We primarily watch the .git directory for changes to HEAD, index, refs, etc.
  // These indicate commits, checkouts, staging, and other git operations.
  watcher = chokidar.watch(gitDir, {
    ignored: [
      '**/index.lock',
      '**/COMMIT_EDITMSG',
      '**/FETCH_HEAD',
      '**/ORIG_HEAD',
      '**/logs/**', // Avoid noise from detailed logs
    ],
    persistent: true,
    ignoreInitial: true,
    depth: 2, // Need to watch refs/heads, etc.
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

  console.log(`[WATCHER] Started watching ${gitDir}`);

  // Optionally watch the working tree for file changes (non-git files)
  // This can be noisier but provides better UX for external edits.
  // For Phase 1, we focus on the .git directory.
}

export function stopWatching() {
  if (watcher) {
    watcher.close();
    watcher = null;
    currentWatchedPath = null;
  }
}
