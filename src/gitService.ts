import { exec, execSync, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { shell, app } from 'electron';
import * as settingsService from './settingsService';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

let currentRepoPath: string | null = null;
let currentAbortController: AbortController | null = null;

export function parseGitError(error: any): { message: string; type?: string } {
  const message = error.message || error.stderr || String(error);

  if (
    message.includes('Authentication failed') ||
    message.includes('could not read Username') ||
    message.includes('could not read Password') ||
    message.includes('Permission denied') ||
    message.includes('401') ||
    message.includes('403') ||
    message.includes('Unauthorized')
  ) {
    return { message, type: 'NetworkAuthError' };
  }

  if (
    message.includes('conflict') ||
    message.includes('MERGE_HEAD exists') ||
    message.includes('Automatic merge failed') ||
    message.includes('resolve all conflicts')
  ) {
    return { message, type: 'MergeConflictError' };
  }

  if (message.includes('detached HEAD')) {
    return { message, type: 'DetachedHeadError' };
  }

  if (message.includes("'flow' is not a git command")) {
    return { 
      message: "Git Flow is not installed on your system. Please install it to use this feature. (e.g. 'brew install git-flow' on macOS or 'apt-get install git-flow' on Linux)", 
      type: 'CommandNotFoundError' 
    };
  }

  return { message };
}



export function cancelCurrentOperation(): { success: boolean } {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
    return { success: true };
  }
  return { success: false };
}

function startOperation(): AbortSignal {
  // If there's an existing operation, we don't automatically cancel it here
  // because multiple non-conflicting operations might be running (though rare)
  // but for "main" operations, the UI should manage this.
  const controller = new AbortController();
  currentAbortController = controller;
  return controller.signal;
}

export interface ConflictedFile {
  path: string;
  type: 'both-modified' | 'deleted-by-us' | 'deleted-by-them' | 'both-added' | 'both-deleted' | 'added-by-us' | 'added-by-them' | 'unknown';
}

function getAuthEnv(remoteUrl?: string): NodeJS.ProcessEnv {
  return {
    GIT_TERMINAL_PROMPT: '0',
    LC_ALL: 'C'
  };
}

export function initializeGitService() {
  // No initialization needed for git service
}

export interface GitOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
  onProgress?: (progress: string) => void;
  signal?: AbortSignal;
}

interface GitExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Core function to run git commands using spawn for better performance and streaming support.
 * Replaces runGitExecFile and runGitCommand internal implementations.
 */
async function runGitSpawn(args: string[], options: GitOptions = {}): Promise<GitExecResult> {
  const repoPath = options.cwd || currentRepoPath;
  if (!repoPath && !args.includes('clone') && !args.includes('config')) {
    throw new Error('No repository open');
  }

  const cmdStr = `git ${args.join(' ')}`;
  const maskedCmd = cmdStr.replace(/:\/\/[^:]+:([^@]+)@/, '://***:***@');
  console.log(`[GIT] ${maskedCmd}`);

  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      return reject(new Error('Operation aborted'));
    }

    const child = spawn('git', args, {
      cwd: repoPath || undefined,
      env: {
        ...fixPath(),
        GIT_TERMINAL_PROMPT: '0',
        LC_ALL: 'C',
        ...options.env
      },
      // Node.js v15.1.0+ supports signal in options
      signal: options.signal,
    });

    let stdout = '';
    let stderr = '';
    const maxBuffer = options.maxBuffer || 10 * 1024 * 1024; // 10MB default

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      if (stdout.length > maxBuffer) {
        child.kill();
        reject(new Error('stdout maxBuffer exceeded'));
      }
    });

    child.stderr.on('data', (data) => {
      const dataStr = data.toString();
      stderr += dataStr;
      
      // Basic progress parsing (can be expanded)
      if (options.onProgress && (dataStr.includes('%') || dataStr.includes('Receiving') || dataStr.includes('Resolving') || dataStr.includes('remote: '))) {
        options.onProgress(dataStr.trim());
      }
      
      if (stderr.length > maxBuffer) {
        child.kill();
        reject(new Error('stderr maxBuffer exceeded'));
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else if (code === null && options.signal?.aborted) {
        // Process was killed by the signal
        reject(new Error('Operation aborted'));
      } else {
        const error = new Error(`Git command failed with code ${code}: ${stderr || stdout}`);
        (error as any).stdout = stdout;
        (error as any).stderr = stderr;
        (error as any).code = code;
        reject(error);
      }
    });

    child.on('error', (err) => {
      if (err.name === 'AbortError') {
        reject(new Error('Operation aborted'));
      } else {
        reject(err);
      }
    });

    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        // Ensure the process is killed even if signal doesn't do it automatically
        child.kill();
      }, { once: true });
    }
  });
}

async function runGitExecFile(args: string[], options: GitOptions = {}): Promise<GitExecResult> {
  return runGitSpawn(args, options);
}

async function runGitCommand(command: string, cwd?: string, env?: NodeJS.ProcessEnv, signal?: AbortSignal, onProgress?: (p: string) => void): Promise<{ stdout: string; stderr: string }> {
  // Split command string into args, handling quotes simply for now
  // For complex commands, we should ideally use runGitExecFile with an array
  const args = command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(arg => arg.replace(/"/g, '')) || [];
  return runGitSpawn(args, { cwd, env, signal, onProgress });
}

export async function cloneRepository(url: string, localPath: string, onProgress?: (p: string) => void): Promise<{ success: boolean; error?: string; errorType?: string }> {
  const signal = startOperation();
  try {
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const env = getAuthEnv(url);

    await runGitExecFile([
      'clone', url, localPath
    ], {
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        ...env
      },
      signal,
      onProgress
    });

    currentRepoPath = localPath;
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  } finally {
    if (currentAbortController?.signal === signal) {
      currentAbortController = null;
    }
  }
}

export async function applyPatch(patch: string, options: { reverse?: boolean, cached?: boolean } = {}): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Create a temporary file for the patch
    const patchPath = path.join(os.tmpdir(), `gitzen-patch-${Date.now()}.diff`);
    fs.writeFileSync(patchPath, patch);

    const args = ['apply'];
    if (options.reverse) args.push('--reverse');
    if (options.cached) args.push('--cached');

    args.push(patchPath);

    try {
      await runGitExecFile(args, {
        cwd: currentRepoPath!,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { success: true };
    } finally {
      // Clean up temp file
      if (fs.existsSync(patchPath)) {
        fs.unlinkSync(patchPath);
      }
    }
  } catch (error: any) {
    const errorMsg = error.stderr || error.message || 'Unknown error';
    return { success: false, error: errorMsg };
  }
}

export async function createStash(): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }
    const branchResult = await getCurrentBranch();
    const branchName = branchResult.branch || 'unknown';
    const message = `WIP on ${branchName}`;
    const escapedMessage = message.replace(/"/g, '\\"');
    const command = `stash push -m "${escapedMessage}"`;
    await runGitCommand(command);
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getStashes(): Promise<{ success: boolean; stashes?: { name: string; message: string }[]; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const { stdout } = await runGitCommand('stash list --pretty=format:"%gD|%gs"');
    const stashes = stdout
      .split('\n')
      .filter((line: string) => line.trim())
      .map((line: string) => {
        const [name, message] = line.split('|');
        return {
          name: name || '',
          message: message || '',
        };
      });

    return { success: true, stashes };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function applyStash(stashRef: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }
    await runGitCommand(`stash apply "${stashRef}"`);
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function deleteStash(stashRef: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }
    await runGitCommand(`stash drop "${stashRef}"`);
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function openRepository(repoPath: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!fs.existsSync(path.join(repoPath, '.git'))) {
      return { success: false, error: 'Not a git repository' };
    }
    currentRepoPath = repoPath;
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getStatus(): Promise<{ success: boolean; files?: Array<{ path: string; status: 'modified' | 'added' | 'deleted'; staged: boolean }>; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // -u ensures untracked files are shown individually, including those in new folders
    const { stdout } = await runGitCommand('status --porcelain -u');
    const files: Array<{ path: string; status: 'modified' | 'added' | 'deleted'; staged: boolean }> = [];

    for (const line of stdout.split('\n')) {
      if (!line || line.length < 4) continue;

      // Git porcelain format: XY filename
      const status = line.substring(0, 2);
      let filePath = line.substring(3).trim();

      // Handle renamed files: "R  old -> new"
      if (status.startsWith('R')) {
        const parts = filePath.split(' -> ');
        if (parts.length > 1) {
          filePath = parts[1];
        }
      }

      // Remove quotes if present
      if (filePath.startsWith('"') && filePath.endsWith('"')) {
        filePath = filePath.slice(1, -1);
      }

      const indexStatus = status[0];
      const worktreeStatus = status[1];

      let statusType: 'modified' | 'added' | 'deleted' = 'added';

      if (indexStatus === '?' || worktreeStatus === '?') {
        statusType = 'added'; // Untracked
      } else if (indexStatus === 'A' || worktreeStatus === 'A') {
        statusType = 'added';
      } else if (indexStatus === 'D' || worktreeStatus === 'D') {
        statusType = 'deleted';
      } else if (indexStatus === 'M' || worktreeStatus === 'M' || indexStatus === 'R') {
        statusType = 'modified';
      }

      files.push({
        path: filePath,
        status: statusType,
        staged: indexStatus !== ' ' && indexStatus !== '?',
      });
    }

    return { success: true, files };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function stageFiles(filePaths: string[]): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Get current status to check which files are deleted
    const statusResult = await getStatus();
    const statusFiles = statusResult.files || [];
    const fileStatusMap = new Map<string, 'modified' | 'added' | 'deleted'>();
    statusFiles.forEach(f => fileStatusMap.set(f.path, f.status));

    // Use execFile with argument array to avoid shell quoting issues with special characters
    // The -- separator tells git that everything after is a file path
    const toAdd: string[] = [];
    const toRm: string[] = [];

    for (const filePath of filePaths) {
      if (fileStatusMap.get(filePath) === 'deleted') {
        toRm.push(filePath);
      } else {
        toAdd.push(filePath);
      }
    }

    if (toRm.length > 0) {
      await runGitExecFile(['rm', '--', ...toRm], {
        cwd: currentRepoPath!,
        maxBuffer: 10 * 1024 * 1024,
      });
    }

    if (toAdd.length > 0) {
      await runGitExecFile(['add', '--', ...toAdd], {
        cwd: currentRepoPath!,
        maxBuffer: 10 * 1024 * 1024,
      });
    }
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function stageAll(): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    await runGitCommand('add -A');
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function unstageAll(): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    await runGitCommand('reset');
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function unstageFiles(filePaths: string[]): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Use execFile with argument array to avoid shell quoting issues with special characters
    // The -- separator tells git that everything after is a file path
    for (const filePath of filePaths) {
      await runGitExecFile(['reset', 'HEAD', '--', filePath], {
        cwd: currentRepoPath!,
        maxBuffer: 10 * 1024 * 1024,
      });
    }
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function commit(message: string, amend: boolean = false): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    if (amend) {
      await runGitExecFile(['commit', '--amend', '-m', message], { cwd: currentRepoPath! });
    } else {
      await runGitExecFile(['commit', '-m', message], { cwd: currentRepoPath! });
    }
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function undoLastCommit(): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    try {
      await runGitCommand('reset --soft HEAD~1');
    } catch (e: any) {
      // If it's the initial commit, HEAD~1 will not exist
      if (e.message && e.message.includes("ambiguous argument 'HEAD~1'")) {
        await runGitCommand('update-ref -d HEAD');
      } else {
        throw e;
      }
    }
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function push(remote: string = 'origin', branch?: string, force: boolean = false, overwrite: boolean = false, onProgress?: (p: string) => void): Promise<{ success: boolean; error?: string; errorType?: string }> {
  const signal = startOperation();
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const { url } = await getRemoteUrl(remote);
    if (!url) throw new Error(`Remote '${remote}' has no URL`);

    const authEnv = getAuthEnv(url);
    const branchName = branch || await getCurrentBranch().then(r => r.branch || 'main');

    let forceFlag = '';
    if (overwrite) {
      forceFlag = ' --force';
    } else if (force) {
      forceFlag = ' --force-with-lease';
    }

    await runGitCommand(`push${forceFlag} -u ${remote} ${branchName}`, undefined, authEnv, signal, onProgress);
    return { success: true };

  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  } finally {
    if (currentAbortController?.signal === signal) {
      currentAbortController = null;
    }
  }
}

export async function addRemote(name: string, url: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }
    await runGitCommand(`remote add ${name} ${url}`);
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function createGitHubRepo(token: string, name: string, isPrivate: boolean, description?: string): Promise<{ success: boolean; cloneUrl?: string; ownerLogin?: string; error?: string; errorType?: string }> {
  try {
    const response = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        name,
        private: isPrivate,
        description,
        auto_init: false, // We want an empty repo to push to
      }),
    });

    if (!response.ok) {
      const errorData: any = await response.json();
      return { success: false, error: errorData.message || 'Failed to create repository' };
    }

    const data: any = await response.json();
    return { success: true, cloneUrl: data.clone_url, ownerLogin: data.owner.login };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getBranchStatus(): Promise<{ success: boolean; ahead?: number; behind?: number; hasUpstream?: boolean; upstream?: string; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Get upstream branch
    let upstream = '';
    try {
      const { stdout } = await runGitCommand('rev-parse --abbrev-ref --symbolic-full-name @{upstream}');
      upstream = stdout.trim();
    } catch (e) {
      return { success: true, ahead: 0, behind: 0, hasUpstream: false };
    }

    if (!upstream) {
      return { success: true, ahead: 0, behind: 0, hasUpstream: false };
    }

    // Get ahead/behind counts
    // git rev-list --left-right --count HEAD...@{upstream}
    // Output: "ahead    behind" (tab separated)
    const { stdout } = await runGitCommand('rev-list --left-right --count HEAD...@{upstream}');
    const parts = stdout.trim().split(/\s+/);

    if (parts.length >= 2) {
      const ahead = parseInt(parts[0], 10);
      const behind = parseInt(parts[1], 10);
      return { success: true, ahead, behind, hasUpstream: true, upstream };
    }

    return { success: true, ahead: 0, behind: 0, hasUpstream: true, upstream };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function pull(remote: string = 'origin', branch?: string, targetBranch?: string, onProgress?: (p: string) => void): Promise<{ success: boolean; error?: string; errorType?: string }> {
  const signal = startOperation();
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const { url } = await getRemoteUrl(remote);
    if (!url) throw new Error(`Remote '${remote}' has no URL`);

    const authEnv = getAuthEnv(url);
    const currentBranchResult = await getCurrentBranch();
    const currentBranch = currentBranchResult.branch;
    const remoteBranchName = branch || (currentBranch || 'main');

    // If targetBranch is specified and is NOT the current branch, we fetch to update it
    if (targetBranch && targetBranch !== currentBranch) {
      await runGitCommand(`fetch ${remote} ${remoteBranchName}:${targetBranch}`, undefined, authEnv, signal, onProgress);
      return { success: true };
    } else {
      await runGitCommand(`pull --no-rebase --ff ${remote} ${remoteBranchName}`, undefined, authEnv, signal, onProgress);
      return { success: true };
    }
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  } finally {
    if (currentAbortController?.signal === signal) {
      currentAbortController = null;
    }
  }
}

export async function getCurrentBranch(): Promise<{ success: boolean; branch?: string; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const { stdout } = await runGitCommand('branch --show-current');
    return { success: true, branch: stdout.trim() };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function hasUnpushedCommits(): Promise<{ success: boolean; hasUnpushed?: boolean; count?: number; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Try to count commits ahead of upstream
    // This will fail if there's no upstream branch, which we handle
    try {
      const { stdout: countOutput } = await runGitCommand('rev-list --count @{upstream}..HEAD');
      const count = parseInt(countOutput.trim(), 10);

      return { success: true, hasUnpushed: count > 0, count };
    } catch (error: any) {
      // No upstream branch configured, so no unpushed commits
      // This is not an error - it just means the branch doesn't track a remote
      return { success: true, hasUnpushed: false, count: 0 };
    }
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function mergeBranchToCurrent(branchToMerge: string): Promise<{ success: boolean; hasConflicts?: boolean; conflictedFiles?: ConflictedFile[]; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Get current branch to verify we're merging into the right branch
    const currentBranchResult = await getCurrentBranch();
    if (!currentBranchResult.success || !currentBranchResult.branch) {
      return { success: false, error: 'Could not determine current branch' };
    }

    // Check if there are uncommitted changes
    const { stdout: statusOut } = await runGitCommand('status --porcelain');
    if (statusOut.trim()) {
      return { success: false, error: 'You have uncommitted changes. Please commit or stash them before merging.' };
    }

    // Perform the merge
    try {
      const currentBranch = currentBranchResult.branch;
      // Use --no-ff to always create a merge commit, and -m to set a proper merge message
      const mergeMessage = currentBranch === branchToMerge
        ? `Merge branch '${branchToMerge}'`
        : `Merge branch '${branchToMerge}' into ${currentBranch}`;

      // Use execFile to avoid shell quoting issues
      await runGitExecFile(['merge', branchToMerge, '--no-ff', '-m', mergeMessage], {
        cwd: currentRepoPath!,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { success: true };
    } catch (mergeError: any) {
      // When git merge fails with conflicts, it leaves the repo in a merge state
      // Check if we're in a merge state by checking for MERGE_HEAD
      const mergeHeadPath = path.join(currentRepoPath!, '.git', 'MERGE_HEAD');
      if (fs.existsSync(mergeHeadPath)) {
        // We're in a merge state, check for conflicted files
        const conflictedFilesResult = await getConflictedFiles();
        if (conflictedFilesResult.success && conflictedFilesResult.files && conflictedFilesResult.files.length > 0) {
          return {
            success: false,
            hasConflicts: true,
            conflictedFiles: conflictedFilesResult.files,
            error: `Merge conflict occurred while merging ${branchToMerge}`,
            errorType: 'MergeConflictError'
          };
        }
        // In merge state but no conflicted files (shouldn't happen, but handle gracefully)
        return {
          success: false,
          hasConflicts: true,
          conflictedFiles: [],
          error: `Merge conflict occurred while merging ${branchToMerge}`,
          errorType: 'MergeConflictError'
        };
      }
      // Not in merge state, so this is a different kind of error
      const parsed = parseGitError(mergeError);
      return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
    }
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export interface HistoryFilters {
  author?: string;
  since?: string;
  until?: string;
  file?: string;
  message?: string;
}

export async function getHistory(maxCount: number = 50, filters?: HistoryFilters): Promise<{
  success: boolean;
  commits?: Array<{
    id: string;
    message: string;
    author: string;
    timestamp: Date;
    branch?: string;
    hash: string;
    isMerge?: boolean;
    parents: string[];
    refs: string;
  }>;
  hasMore?: boolean;
  error?: string;
  errorType?: string;
}> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Try to fetch one more than requested to see if there are more
    const diagramMaxCount = Math.min(maxCount, 2000);
    const fetchCount = diagramMaxCount + 1;

    // Use --all to show all branches regardless of which branch is checked out
    // Use -z to separate commits with NUL byte to handle multi-line messages safely
    // Use %B for full body
    const delimiter = '|||';
    
    const args = [
      'log',
      `-n`, `${fetchCount}`,
      '--all',
      '--date-order',
      `--pretty=format:%H${delimiter}%B${delimiter}%an${delimiter}%ad${delimiter}%D${delimiter}%P`,
      '--date=iso',
      '-z'
    ];
    
    if (filters?.author) args.push(`--author=${filters.author}`);
    if (filters?.message) args.push(`--grep=${filters.message}`);
    if (filters?.since) args.push(`--since=${filters.since}`);
    if (filters?.until) args.push(`--until=${filters.until}`);
    if (filters?.file) {
      args.push('--');
      args.push(filters.file);
    }

    const { stdout } = await runGitExecFile(args, { cwd: currentRepoPath });

    // Split by NUL byte (the last entry might be empty if ends with NUL)
    const rawLines = stdout.split('\0').filter(line => line.trim());
    const hasMore = rawLines.length > diagramMaxCount;
    const lines = hasMore ? rawLines.slice(0, diagramMaxCount) : rawLines;

    // Build a map of commit hash to branch name
    const commitToBranch: Record<string, string> = {};

    // First pass: collect branch info from refs
    for (const line of lines) {
      const parts = line.split(delimiter);
      if (parts.length < 5) continue;

      const hash = parts[0].trim();
      const refs = (parts[4] || '').trim();

      if (refs) {
        const refParts = refs.split(',').map(r => r.trim());
        for (const ref of refParts) {
          if (ref.startsWith('tag:')) continue;
          if (ref.includes('HEAD -> ')) {
            const match = ref.match(/HEAD -> (.+)/);
            if (match) {
              const refBranch = match[1].trim();

              commitToBranch[hash] = refBranch;
              break;

            }
          }
          else if (ref && ref.trim() && !ref.startsWith('tag:')) {
            commitToBranch[hash] = ref.trim();
            break;
          }
        }
      }
    }

    const commits: Array<{
      id: string;
      message: string;
      author: string;
      timestamp: Date;
      branch?: string;
      hash: string;
      isMerge?: boolean;
      parents: string[];
      refs: string;
    }> = [];

    // Second pass: propagate branch info
    let changed = true;
    let iterations = 0;
    const maxIterations = 10;

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;
      const parentToChildren: Record<string, string[]> = {};
      for (const line of lines) {
        const parts = line.split(delimiter);
        if (parts.length < 5) continue;
        const hash = parts[0].trim();
        const parents = (parts.length > 5 ? parts[5] : '').trim();
        const parentHashes = parents ? parents.split(' ').filter(p => p.trim()) : [];

        if (parentHashes.length > 0) {
          const firstParent = parentHashes[0].trim();
          if (!parentToChildren[firstParent]) {
            parentToChildren[firstParent] = [];
          }
          parentToChildren[firstParent].push(hash);
        }
      }
      for (const parentHash in parentToChildren) {
        if (commitToBranch[parentHash]) continue;
        for (const childHash of parentToChildren[parentHash]) {
          if (commitToBranch[childHash]) {
            commitToBranch[parentHash] = commitToBranch[childHash];
            changed = true;
            break;
          }
        }
      }
    }

    // Third pass: build commit list
    for (const line of lines) {
      const parts = line.split(delimiter);
      if (parts.length < 5) continue;

      const hash = parts[0].trim();
      const message = parts[1] || 'No message'; // Full message (subject + body)
      const author = parts[2] || 'Unknown';
      const dateStr = parts[3];
      const refs = parts[4] || '';
      const parents = (parts.length > 5 ? parts[5] : '').trim();

      const parentHashes = parents ? parents.split(' ').filter(p => p.trim()) : [];
      const isMerge = parentHashes.length > 1;

      let branchName: string | undefined = commitToBranch[hash];

      if (!branchName && isMerge) {
        const mergeMatch = message.match(/Merge branch ['"]([^'"]+)['"]/);
        if (mergeMatch) {
          branchName = mergeMatch[1];
          commitToBranch[hash] = branchName;
        }
      }

      commits.push({
        id: hash.substr(0, 7),
        message: message || 'No message',
        author: author || 'Unknown',
        timestamp: new Date(dateStr),
        branch: branchName,
        hash: hash.substr(0, 7),
        isMerge: isMerge,
        parents: parentHashes.map(p => p.substr(0, 7)),
        refs: refs
      });
    }

    return { success: true, commits, hasMore };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}


export async function getBranches(): Promise<{ success: boolean; branches?: string[]; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Use --format option to get just the branch names, which is more reliable
    const { stdout } = await runGitCommand('branch --list --format="%(refname:short)"');
    const branches = stdout.trim().split('\n')
      .map(b => b.trim())
      .filter(b => b)
      // Remove duplicates by converting to Set and back to array
      .filter((b, index, self) => self.indexOf(b) === index);

    return { success: true, branches };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getBranchesDetailed(): Promise<{ success: boolean; branches?: Array<{ name: string; current: boolean; upstream?: string; ahead: number; behind: number }>; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // %(refname:short) - Branch name
    // %(upstream:short) - Upstream branch name
    // %(upstream:track) - Tracking status [ahead X, behind Y]
    // %(HEAD) - '*' if current branch
    const { stdout } = await runGitCommand('for-each-ref --format="%(refname:short)|%(upstream:short)|%(upstream:track)|%(HEAD)" refs/heads');

    const branches = stdout.trim().split('\n')
      .filter(line => line.trim())
      .map(line => {
        const [name, upstream, track, head] = line.split('|');

        let ahead = 0;
        let behind = 0;

        // Parse track info "[ahead 1, behind 2]"
        if (track) {
          const aheadMatch = track.match(/ahead (\d+)/);
          if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);

          const behindMatch = track.match(/behind (\d+)/);
          if (behindMatch) behind = parseInt(behindMatch[1], 10);
        }

        return {
          name: name || '',
          current: head === '*',
          upstream: upstream || undefined,
          ahead,
          behind
        };
      });

    return { success: true, branches };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function fetchRemote(remote: string = 'origin', onProgress?: (p: string) => void): Promise<{ success: boolean; error?: string; errorType?: string }> {
  const signal = startOperation();
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const { url } = await getRemoteUrl(remote);
    if (!url) throw new Error(`Remote '${remote}' has no URL`);

    const authEnv = getAuthEnv(url);
    await runGitCommand(`fetch ${remote} --prune`, undefined, authEnv, signal, onProgress);
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  } finally {
    if (currentAbortController?.signal === signal) {
      currentAbortController = null;
    }
  }
}

export async function createBranch(name: string, checkout: boolean = true): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    if (checkout) {
      await runGitCommand(`checkout -b ${name}`);
    } else {
      await runGitCommand(`branch ${name}`);
    }
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function checkoutBranch(name: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Check if this is a remote branch (format: origin/branchName or remote/branchName)
    // First, check if the first part is actually a remote name
    if (name.includes('/')) {
      const parts = name.split('/');
      const possibleRemote = parts[0];

      // Check if the first part is actually a remote
      let isRemoteBranch = false;
      try {
        const { stdout: remotes } = await runGitCommand('remote');
        const remoteList = remotes.trim().split('\n').map(r => r.trim()).filter(r => r);
        isRemoteBranch = remoteList.includes(possibleRemote);
      } catch (e) {
        // If we can't check remotes, assume it's not a remote branch
        isRemoteBranch = false;
      }

      if (isRemoteBranch) {
        // This is a remote branch - extract branch name properly
        const remoteName = parts[0];
        const branchName = parts.slice(1).join('/'); // Handle branch names with slashes

        // Check if the local branch already exists by trying to check it out
        // If it doesn't exist, Git will error, then we create it from remote
        try {
          // Try checkout first - if branch exists, this will work
          await runGitExecFile(['checkout', branchName], {
            cwd: currentRepoPath!,
            maxBuffer: 10 * 1024 * 1024,
          });
          return { success: true };
        } catch (checkoutError: any) {
          // If branch doesn't exist locally, create it from remote
          // Use -b to create a new branch and set up tracking
          await runGitExecFile(['checkout', '-b', branchName, `${remoteName}/${branchName}`], {
            cwd: currentRepoPath!,
            maxBuffer: 10 * 1024 * 1024,
          });
          return { success: true };
        }
      }
    }

    // Local branch checkout (either no slash, or slash but not a remote branch)
    await runGitExecFile(['checkout', name], {
      cwd: currentRepoPath!, maxBuffer: 10 * 1024 * 1024,
    });
    return { success: true };
  } catch (error: any) {
    const errorMsg = error.message || error.stderr || 'Unknown error';
    // Check for specific error about branch already existing
    if (errorMsg.includes('already exists')) {
      return { success: false, error: `Branch already exists. Please use the existing branch or delete it first.` };
    }
    return { success: false, error: errorMsg };
  }
}





export async function getGitUserConfig(): Promise<{ success: boolean; name?: string; email?: string; isGlobal?: boolean; error?: string; errorType?: string }> {
  try {
    // Try to get name and email. If they are not set, git config returns error code 1.
    // We'll try to get them using runGitExecFile directly to handle cases where no repo is open.

    let name = '';
    let email = '';
    let isGlobal = true;

    try {
      const result = await (currentRepoPath
        ? runGitExecFile(['config', '--show-scope', 'user.name'], { cwd: currentRepoPath })
        : runGitExecFile(['config', '--global', 'user.name']));

      const stdout = (result.stdout as unknown as string).trim();
      if (currentRepoPath && stdout.includes('\t')) {
        const [scope, value] = stdout.split('\t');
        isGlobal = scope === 'global';
        name = value;
      } else {
        name = stdout;
        isGlobal = true;
      }
    } catch (e) {
      // Not set, ignore
    }

    try {
      const result = await (currentRepoPath
        ? runGitExecFile(['config', 'user.email'], { cwd: currentRepoPath })
        : runGitExecFile(['config', '--global', 'user.email']));
      email = (result.stdout as unknown as string).trim();
    } catch (e) {
      // Not set, ignore
    }

    return { success: true, name, email, isGlobal };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function setGitUserConfig(name: string, email: string, isGlobal: boolean): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!isGlobal && !currentRepoPath) {
      return { success: false, error: 'No repository open to save local configuration' };
    }

    const args = ['config'];
    if (isGlobal) {
      args.push('--global');
    } else {
      args.push('--local');
    }

    // Set user.name
    const nameArgs = [...args, 'user.name', name];
    await (isGlobal
      ? runGitExecFile(nameArgs)
      : runGitExecFile(nameArgs, { cwd: currentRepoPath! }));

    // Set user.email
    const emailArgs = [...args, 'user.email', email];
    await (isGlobal
      ? runGitExecFile(emailArgs)
      : runGitExecFile(emailArgs, { cwd: currentRepoPath! }));

    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export function getRepoPath(): { success: boolean; path?: string; error?: string } {
  if (currentRepoPath) {
    return { success: true, path: currentRepoPath };
  }
  return { success: false, error: 'No repository open' };
}

export async function getRepoName(): Promise<{ success: boolean; name?: string; error?: string; errorType?: string }> {
  if (!currentRepoPath) {
    return { success: false, error: 'No repository open' };
  }

  try {
    const name = path.basename(currentRepoPath);
    return { success: true, name };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getSuperprojectPath(): Promise<{ success: boolean; path?: string; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }
    const { stdout } = await runGitCommand('rev-parse --show-superproject-working-tree');
    const pathOutput = stdout.trim();
    return { success: true, path: pathOutput || undefined };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getRemoteUrl(remote: string = 'origin'): Promise<{ success: boolean; url?: string; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const { stdout } = await runGitCommand(`remote get-url ${remote}`);
    return { success: true, url: stdout.trim() };
  } catch (error: any) {
    // Remote might not exist, that's okay
    return { success: false, error: error.message || 'Remote not found' };
  }
}

export async function setRemoteUrl(remote: string, url: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    await runGitCommand(`remote set-url ${remote} ${url}`);
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function fetchAllRemotes(onProgress?: (p: string) => void): Promise<{ success: boolean; error?: string; errorType?: string }> {
  const signal = startOperation();
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Get list of remotes first
    const { stdout: remotesOutput } = await runGitCommand('remote');
    const remotes = remotesOutput.trim().split('\n').filter(r => r);

    // Fetch each remote individually with credentials
    let errors: string[] = [];
    for (const remote of remotes) {
      if (signal.aborted) throw new Error('Operation aborted');
      try {
        const { url } = await getRemoteUrl(remote);
        if (url) {
          const authEnv = getAuthEnv(url);
          if (onProgress) onProgress(`Fetching ${remote}...`);
          await runGitCommand(`fetch ${remote} --prune`, undefined, authEnv, signal, onProgress);
        }
      } catch (e: any) {
        if (e.message === 'Operation aborted') throw e;
        console.warn(`Failed to fetch remote ${remote}:`, e);
        errors.push(e.message || String(e));
      }
    }

    if (errors.length > 0) {
      return { success: false, error: errors[0] };
    }

    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  } finally {
    if (currentAbortController?.signal === signal) {
      currentAbortController = null;
    }
  }
}

export async function getRemoteBranches(): Promise<{ success: boolean; branches?: Array<{ name: string; remote: string }>; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const { stdout } = await runGitCommand('branch -r');
    const branches = stdout
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line && !line.includes('HEAD'))
      .map((line: string) => {
        const match = line.match(/^([^/]+)\/(.+)$/);
        if (match) {
          return { name: match[2], remote: match[1] };
        }
        return { name: line, remote: 'origin' };
      });

    return { success: true, branches };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getTags(): Promise<{ success: boolean; tags?: Array<{ name: string; commit: string; date: Date }>; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Use %(*objectname:short) to get the commit hash for annotated tags.
    // If it's a lightweight tag, %(*objectname:short) is empty, so we fall back to %(objectname:short).
    const { stdout } = await runGitCommand('tag -l --format="%(refname:short)|%(objectname:short)|%(*objectname:short)|%(creatordate:iso8601)"');
    const tags = stdout
      .split('\n')
      .filter((line: string) => line.trim())
      .map((line: string) => {
        const [name, hash, dereferencedHash, dateStr] = line.split('|');
        return {
          name: name || '',
          commit: dereferencedHash || hash || '',
          date: dateStr ? new Date(dateStr) : new Date(),
        };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    return { success: true, tags };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getCommitDiff(commitHash: string): Promise<{ success: boolean; files?: Array<{ path: string; status: 'modified' | 'added' | 'deleted'; additions: number; deletions: number; diff: string }>; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Use -m --first-parent to handle merge commits (showing changes relative to the branch being merged into)
    // and standard commits uniformly.
    const { stdout: fullDiff } = await runGitCommand(`show -m --first-parent ${commitHash}`);

    const diffLines = fullDiff.split('\n');
    const files: Array<{ path: string; status: 'modified' | 'added' | 'deleted'; additions: number; deletions: number; diff: string }> = [];

    let currentFile: { path: string; status: 'modified' | 'added' | 'deleted'; additions: number; deletions: number; diff: string } | null = null;
    let fileDiffStart = 0;

    for (let i = 0; i < diffLines.length; i++) {
      const line = diffLines[i];
      if (line.startsWith('diff --git')) {
        if (currentFile) {
          currentFile.diff = diffLines.slice(fileDiffStart, i).join('\n');
          // Only push if we have a valid path (avoid empty parsing artifacts)
          if (currentFile.path) {
            files.push(currentFile);
          }
        }
        fileDiffStart = i;
        currentFile = null; // Reset

        // Robust parsing: try to capture path from "diff --git a/... b/..."
        // We use a regex that allows for spaces in paths by matching non-greedily if possible,
        // or just capturing the whole line and relying on fallback.
        // Standard format: diff --git a/path b/path
        // Quoted: diff --git "a/path with spaces" "b/path with spaces"

        // Strategy: Initialize with empty path. Wait for +++ or --- or extended header to confirm path.
        // But we can try to guess from the diff line for renames/mode changes.
        const match = line.match(/^diff --git (?:a\/|"?a\/)(.+) (?:b\/|"?b\/)(.+?)(?:"?)$/);
        if (match) {
          const path = match[2] || match[1];
          currentFile = {
            path: path.replace(/^"|"$/g, ''),
            status: 'modified',
            additions: 0,
            deletions: 0,
            diff: '',
          };
        } else {
          // Fallback init
          currentFile = {
            path: '',
            status: 'modified',
            additions: 0,
            deletions: 0,
            diff: '',
          };
        }
      }

      if (currentFile) {
        if (line.startsWith('new file mode')) {
          currentFile.status = 'added';
        } else if (line.startsWith('deleted file mode')) {
          currentFile.status = 'deleted';
        } else if (line.startsWith('+++ b/')) {
          currentFile.path = line.substring(6).trim().replace(/^"|"$/g, '');
        } else if (line.startsWith('--- a/') && (!currentFile.path || currentFile.status === 'deleted')) {
          currentFile.path = line.substring(6).trim().replace(/^"|"$/g, '');
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
          currentFile.additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentFile.deletions++;
        }
      }
    }

    // Push the last file!
    if (currentFile) {
      currentFile.diff = diffLines.slice(fileDiffStart).join('\n');
      if (currentFile.path) {
        files.push(currentFile);
      }
    }

    return { success: true, files };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getFileDiff(filePath: string, staged: boolean): Promise<{ success: boolean; diff?: string; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Check if the file is untracked (new)
    // If it's untracked, 'git diff' normally shows nothing.
    // We want to show the whole file as an addition.

    let isUntracked = false;
    if (!staged) {
      const statusResult = await getStatus();
      if (statusResult.success) {
        const fileStatus = statusResult.files?.find(f => f.path === filePath);
        // In getStatus, we currently mark untracked as staged: false, status: 'added'
        // But git status --porcelain shows them as ??
        // Let's re-verify status logic if needed, but for now check if it's truly untracked.
        const { stdout: checkUntracked } = await runGitCommand(`ls-files --others --exclude-standard ${filePath}`);
        if (checkUntracked.trim() === filePath) {
          isUntracked = true;
        }
      }
    }

    let args: string[];
    if (isUntracked) {
      // For untracked files, we can use --no-index and diff against /dev/null
      // or simply use a trick: git diff --no-index /dev/null filePath
      // On Windows /dev/null might not work, so we use NUL
      const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
      args = ['diff', '--no-index', nullDevice, filePath];
    } else {
      args = ['diff'];
      if (staged) {
        args.push('--cached');
      }
      args.push('--');
      args.push(filePath);
    }

    // Unlike other commands, `git diff` can exit with code 1 if there are changes.
    // We need to handle this gracefully by catching the error and checking stdout.
    try {
      const { stdout } = await runGitSpawn(args, {
        cwd: currentRepoPath!,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
      // No diff found, returns empty string.
      return { success: true, diff: stdout };
    } catch (error: any) {
      // If there's a diff, git exits with 1, and runGitSpawn (via Promise rejection) throws.
      // The diff is in error.stdout.
      if (typeof error.stdout === 'string') {
        let diff = error.stdout;
        // If we used --no-index against /dev/null, the header might look weird.
        // We might want to fix it up to look like a standard git diff.
        if (isUntracked) {
          diff = diff.replace(/^--- (?:.*)$/m, `--- /dev/null`);
          diff = diff.replace(/^\+\+\+ (?:.*)$/m, `+++ b/${filePath}`);
        }
        return { success: true, diff };
      }
      // A real error occurred
      throw error;
    }
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function deleteBranch(branchName: string, force: boolean = false): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const currentResult = await getCurrentBranch();
    if (currentResult.success && currentResult.branch === branchName) {
      return { success: false, error: `Cannot delete branch '${branchName}' because it is currently checked out.` };
    }

    const command = force ? `branch -D ${branchName}` : `branch -d ${branchName}`;
    await runGitCommand(command);
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function renameBranch(oldName: string, newName: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    await runGitCommand(`branch -m "${oldName}" "${newName}"`);
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function deleteRemoteBranch(remoteBranchName: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Extract remote and branch name from remote/branch format
    const parts = remoteBranchName.split('/');
    if (parts.length < 2) {
      return { success: false, error: 'Invalid remote branch format. Expected format: remote/branch' };
    }

    const remoteName = parts[0];
    const branchName = parts.slice(1).join('/'); // Handle branch names with slashes

    const repoPath = currentRepoPath;

    // Delete remote branch using git push --delete
    try {
      const { url } = await getRemoteUrl(remoteName);
      if (url) {
        const authEnv = getAuthEnv(url);
        await runGitExecFile(['push', remoteName, '--delete', branchName], {
          cwd: repoPath,
          maxBuffer: 10 * 1024 * 1024,
          env: {
            ...process.env,
            ...authEnv
          },
        });
      }
    } catch (error: any) {
      const errorMsg = error.message || '';
      // If the branch is already gone from remote, we consider it a success for the user
      // but we still want to prune our local tracking branch
      if (!errorMsg.includes('unable to delete') && !errorMsg.includes('remote ref does not exist')) {
        throw error;
      }
    }

    // Also prune the local tracking branch to be sure
    try {
      await runGitCommand(`branch -dr ${remoteName}/${branchName}`);
    } catch (e) {
      // Ignore errors if local tracking ref is already gone
    }

    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function deleteTag(tagName: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    await runGitCommand(`tag -d ${tagName}`);
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function createTag(name: string, commitHash?: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const command = commitHash ? `tag ${name} ${commitHash}` : `tag ${name}`;
    await runGitCommand(command);
    return { success: true };
  } catch (error: any) {
    const errorMsg = error.message || error.stderr || 'Unknown error';
    if (errorMsg.includes('already exists')) {
      return { success: false, error: `Tag '${name}' already exists` };
    }
    return { success: false, error: errorMsg };
  }
}

export async function pushTag(tagName: string, remote: string = 'origin'): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const { url } = await getRemoteUrl(remote);
    if (!url) throw new Error(`Remote '${remote}' has no URL`);

    const authEnv = getAuthEnv(url);
    await runGitCommand(`push ${remote} ${tagName}`, undefined, authEnv);
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getRemoteTags(remote: string = 'origin'): Promise<{ success: boolean; tags?: string[]; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Use ls-remote to list tags on the remote
    const { url } = await getRemoteUrl(remote);
    if (!url) throw new Error(`Remote '${remote}' has no URL`);

    const authEnv = getAuthEnv(url);
    const { stdout } = await runGitCommand(`ls-remote --tags --refs ${remote}`, undefined, authEnv);

    const tags = stdout.split('\n')
      .map(line => {
        const parts = line.split('\t');
        if (parts.length > 1) {
          return parts[1].replace('refs/tags/', '');
        }
        return '';
      })
      .filter(t => t);

    return { success: true, tags };
  } catch (error: any) {
    // If remote doesn't exist or fails, just return empty list or error
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function revertFileChanges(filePath: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Use git checkout to revert changes (works for both modified and deleted files)

    // The -- flag tells git that everything after is a file path

    await runGitExecFile(['checkout', '--', filePath], {

      cwd: currentRepoPath!,

      maxBuffer: 10 * 1024 * 1024,

    });

    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getConflictedFiles(): Promise<{ success: boolean; files?: ConflictedFile[]; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Check if we're in a merge or rebase state
    const mergeHeadPath = path.join(currentRepoPath, '.git', 'MERGE_HEAD');
    const rebaseMergePath = path.join(currentRepoPath, '.git', 'rebase-merge');
    const rebaseApplyPath = path.join(currentRepoPath, '.git', 'rebase-apply');
    const cherryPickHeadPath = path.join(currentRepoPath, '.git', 'CHERRY_PICK_HEAD');

    if (!fs.existsSync(mergeHeadPath) && !fs.existsSync(rebaseMergePath) && !fs.existsSync(rebaseApplyPath) && !fs.existsSync(cherryPickHeadPath)) {
      // Not in a known conflict state, but we can still check for unmerged files
      // return { success: false, error: 'Not in a merge or rebase state' };
    }

    // Get conflicted files using git status --porcelain
    // Conflicted files have status codes like: UU (both modified), AA (both added), DD (both deleted), AU, UA, DU, UD, etc.
    const { stdout } = await runGitCommand('status --porcelain');
    const conflictedFiles: ConflictedFile[] = [];

    for (const line of stdout.trim().split('\n').filter(l => l)) {
      const match = line.match(/^(.{1,2})\s+(.+)$/);
      if (match) {
        let status = match[1];
        let filePath = match[2];

        // Remove quotes if present
        if ((filePath.startsWith('"') && filePath.endsWith('"')) ||
          (filePath.startsWith("'") && filePath.endsWith("'"))) {
          filePath = filePath.slice(1, -1);
        }

        // Ensure status is always 2 characters
        if (status.length === 1) {
          status = ' ' + status;
        }

        const indexStatus = status[0];
        const worktreeStatus = status[1];

        // Check if this is a conflicted file (unmerged)
        // U = unmerged, A = added, D = deleted
        // UU = both modified, AA = both added, DD = both deleted, AU/UA = one added one modified, etc.
        if ((indexStatus === 'U' || indexStatus === 'A' || indexStatus === 'D') &&
          (worktreeStatus === 'U' || worktreeStatus === 'A' || worktreeStatus === 'D')) {

          let type: ConflictedFile['type'] = 'unknown';

          if (indexStatus === 'D' && worktreeStatus === 'D') type = 'both-deleted';
          else if (indexStatus === 'A' && worktreeStatus === 'U') type = 'added-by-us'; // AU
          else if (indexStatus === 'U' && worktreeStatus === 'D') type = 'deleted-by-them'; // UD
          else if (indexStatus === 'U' && worktreeStatus === 'A') type = 'added-by-them'; // UA
          else if (indexStatus === 'D' && worktreeStatus === 'U') type = 'deleted-by-us'; // DU
          else if (indexStatus === 'A' && worktreeStatus === 'A') type = 'both-added'; // AA
          else if (indexStatus === 'U' && worktreeStatus === 'U') type = 'both-modified'; // UU

          // Skip if both are deleted (DD) as there's nothing to resolve? 
          // Actually user might want to acknowledge it. But typically git status handles it.
          // Let's include it so UI can show it if needed.

          conflictedFiles.push({ path: filePath, type });
        }
      }
    }

    return { success: true, files: conflictedFiles };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function resolveConflict(filePath: string, decision: 'keep' | 'delete'): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    if (decision === 'delete') {
      await runGitExecFile(['rm', '--', filePath], {
        cwd: currentRepoPath,
        maxBuffer: 10 * 1024 * 1024,
      });
    } else {
      // keep means we add the file (accepting the content currently in worktree or index)
      await runGitExecFile(['add', '--', filePath], {
        cwd: currentRepoPath,
        maxBuffer: 10 * 1024 * 1024,
      });
    }
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function abortMerge(): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Check if we're in a merge state
    const mergeHeadPath = path.join(currentRepoPath, '.git', 'MERGE_HEAD');
    if (!fs.existsSync(mergeHeadPath)) {
      return { success: false, error: 'Not in a merge state' };
    }

    await runGitExecFile(['merge', '--abort'], {

      cwd: currentRepoPath!,

      maxBuffer: 10 * 1024 * 1024,

    });



    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function abortConflict(): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const rebaseMergePath = path.join(currentRepoPath, '.git', 'rebase-merge');
    const rebaseApplyPath = path.join(currentRepoPath, '.git', 'rebase-apply');
    const cherryPickHeadPath = path.join(currentRepoPath, '.git', 'CHERRY_PICK_HEAD');
    const mergeHeadPath = path.join(currentRepoPath, '.git', 'MERGE_HEAD');

    if (fs.existsSync(rebaseMergePath) || fs.existsSync(rebaseApplyPath)) {
      await runGitExecFile(['rebase', '--abort'], { cwd: currentRepoPath, maxBuffer: 10 * 1024 * 1024 });
    } else if (fs.existsSync(cherryPickHeadPath)) {
      await runGitExecFile(['cherry-pick', '--abort'], { cwd: currentRepoPath, maxBuffer: 10 * 1024 * 1024 });
    } else if (fs.existsSync(mergeHeadPath)) {
      await runGitExecFile(['merge', '--abort'], { cwd: currentRepoPath, maxBuffer: 10 * 1024 * 1024 });
    } else {
      return { success: false, error: 'No active conflict operation found to abort' };
    }

    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function openFileInDefaultEditor(filePath: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) return { success: false, error: 'No repository open' };
    const fullPath = path.join(currentRepoPath, filePath);
    const error = await shell.openPath(fullPath);
    if (error) throw new Error(error);
    return { success: true };
  } catch (openError: any) {
    try {
      if (!currentRepoPath) return { success: false, error: 'No repository open' };
      const fullPath = path.join(currentRepoPath, filePath);
      const platform = process.platform;
      const command = platform === 'win32' ? `start "" "${fullPath}"` : platform === 'darwin' ? `open "${fullPath}"` : `xdg-open "${fullPath}"`;
      await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Failed to open file' };
    }
  }
}

export async function openFileInMergeTool(filePath: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  const signal = startOperation();
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const fullPath = path.join(currentRepoPath, filePath);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: 'File does not exist' };
    }

    // First, check if user has configured a custom merge tool
    const customMergeToolPath = settingsService.getMergeToolPath();
    let handled = false;

    if (customMergeToolPath && fs.existsSync(customMergeToolPath)) {
      try {
        if (process.platform === 'darwin' && customMergeToolPath.endsWith('.app')) {
          await execAsync(`open -a "${customMergeToolPath}" "${fullPath}"`, { signal });
        } else {
          await execFileAsync(customMergeToolPath, [fullPath], { cwd: currentRepoPath!, maxBuffer: 10*1024*1024, signal });
        }
        return { success: true };
      } catch (customToolError: any) {
        if (signal?.aborted) throw new Error('Operation aborted');
        console.warn('Custom merge tool failed, trying alternatives:', customToolError.message);
      }
    }

    // Second, if no custom tool worked, check if a formal git merge.tool is configured
    try {
      const { stdout } = await runGitExecFile(['config', 'merge.tool'], { cwd: currentRepoPath! });
      if (stdout.trim()) {
        try {
          await runGitExecFile(['mergetool', '--no-prompt', '--', filePath], { cwd: currentRepoPath!, maxBuffer: 10*1024*1024, signal });
          return { success: true };
        } catch (mergetoolError: any) {
          if (signal?.aborted) throw new Error('Operation aborted');
          console.warn('git mergetool failed:', mergetoolError.message);
        }
      }
    } catch (e) {
      // Configuration not found, skip git mergetool completely so node doesn't hang on vimdiff
    }

    // Final Fallback: just open the file normally in the OS!
    try {
      const error = await shell.openPath(fullPath);
      if (error) throw new Error(error);
      return { success: true };
    } catch (openError: any) {
      const platform = process.platform;
      const command = platform === 'win32' ? `start "" "${fullPath}"` : platform === 'darwin' ? `open "${fullPath}"` : `xdg-open "${fullPath}"`;
      await execAsync(command, { maxBuffer: 10 * 1024 * 1024, signal });
      return { success: true };
    }
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function deleteFile(filePath: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Delete the file from the filesystem
    const fullPath = path.join(currentRepoPath, filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return { success: true };
    } else {
      return { success: false, error: 'File does not exist' };
    }
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getTagsForCommit(commitHash: string): Promise<{ success: boolean; tags?: string[]; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const { stdout } = await runGitCommand(`tag --points-at ${commitHash}`);
    const tags = stdout
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line);

    return { success: true, tags };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

/**
 * Tests if Git can authenticate to a remote using built-in credential mechanisms
 * (credential helper, SSH keys, etc.) without explicit credentials
 */
export async function testGitCredentials(remoteUrl: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Try git ls-remote without explicit credentials
    // Git will use credential helper, SSH keys, or prompt
    // We rely on getAuthEnv to inject known credentials if available, otherwise fallback to system.

    const authEnv = getAuthEnv(remoteUrl);

    await runGitCommand(`ls-remote "${remoteUrl}"`, undefined, authEnv);
    return { success: true };
  } catch (error: any) {
    const errorMsg = error.message || error.stderr || String(error);
    const errorCode = error.code;

    // Check for authentication-related errors
    if (errorCode === 128 ||
      errorMsg.includes('Authentication failed') ||
      errorMsg.includes('fatal: could not read Username') ||
      errorMsg.includes('fatal: could not read Password') ||
      errorMsg.includes('Permission denied') ||
      errorMsg.includes('401') ||
      errorMsg.includes('403') ||
      errorMsg.includes('Unauthorized')) {
      return { success: false, error: 'Git credential system could not authenticate' };
    }

    // For other errors, return failure but don't assume it's auth-related
    return { success: false, error: errorMsg };
  }
}


export async function rebaseBranch(branch: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    await runGitExecFile(['rebase', branch], { cwd: currentRepoPath! });
    return { success: true };
  } catch (error: any) {
    const errorMsg = error.message || error.stderr || 'Unknown error';
    if (errorMsg.includes('conflict') || errorMsg.includes('resolve all conflicts')) {
      // This is expected for conflicts
      return { success: false, error: 'Rebase paused due to conflicts' };
    }
    return { success: false, error: errorMsg };
  }
}

export async function abortRebase(): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }
    await runGitCommand('rebase --abort');
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function continueRebase(): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }
    // We need to set GIT_EDITOR to true (or cat) to handle "resolved" commits that might pop up an editor
    // but typically continue just goes.
    // However, if there are changes, it might ask for commit message.
    await runGitCommand('rebase --continue', undefined, { GIT_EDITOR: 'true' });
    return { success: true };
  } catch (error: any) {
    const errorMsg = error.message || error.stderr || 'Unknown error';
    if (errorMsg.includes('conflict') || errorMsg.includes('resolve all conflicts')) {
      return { success: false, error: 'Rebase paused due to conflicts' };
    }
    return { success: false, error: errorMsg };
  }
}

export async function getRebaseStatus(): Promise<{ success: boolean; inProgress: boolean; currentStep?: number; totalSteps?: number; stoppedMessage?: string; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open', inProgress: false };
    }

    const rebaseMergePath = path.join(currentRepoPath, '.git', 'rebase-merge');
    const rebaseApplyPath = path.join(currentRepoPath, '.git', 'rebase-apply');

    if (fs.existsSync(rebaseMergePath)) {
      // Interactive or merge-based rebase
      let current = 0;
      let total = 0;
      let stoppedMessage: string | undefined;
      try {
        const msgNum = fs.readFileSync(path.join(rebaseMergePath, 'msgnum'), 'utf8').trim();
        const end = fs.readFileSync(path.join(rebaseMergePath, 'end'), 'utf8').trim();
        current = parseInt(msgNum, 10);
        total = parseInt(end, 10);
        
        try {
          const stoppedSha = fs.readFileSync(path.join(rebaseMergePath, 'stopped-sha'), 'utf8').trim();
          if (stoppedSha) {
            const { stdout } = await runGitExecFile(['log', '-1', '--pretty=%s', stoppedSha], { cwd: currentRepoPath! });
            stoppedMessage = stdout.trim();
          }
        } catch (e) { /* ignore */ }
      } catch (e) {
        // ignore parsing errors
      }
      return { success: true, inProgress: true, currentStep: current, totalSteps: total, stoppedMessage };
    } else if (fs.existsSync(rebaseApplyPath)) {
      // Apply based rebase
      let current = 0;
      let total = 0;
      let stoppedMessage: string | undefined;
      try {
        const next = fs.readFileSync(path.join(rebaseApplyPath, 'next'), 'utf8').trim();
        const last = fs.readFileSync(path.join(rebaseApplyPath, 'last'), 'utf8').trim();
        current = parseInt(next, 10);
        total = parseInt(last, 10);

        try {
          const originalCommit = fs.readFileSync(path.join(rebaseApplyPath, 'original-commit'), 'utf8').trim();
          if (originalCommit) {
            const { stdout } = await runGitExecFile(['log', '-1', '--pretty=%s', originalCommit], { cwd: currentRepoPath! });
            stoppedMessage = stdout.trim();
          }
        } catch (e) { /* ignore */ }
      } catch (e) {
        // ignore
      }
      return { success: true, inProgress: true, currentStep: current, totalSteps: total, stoppedMessage };
    }

    return { success: true, inProgress: false };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error', inProgress: false };
  }
}

export async function revertCommit(commitHash: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Attempt revert
    // Use --no-edit to avoid launching editor for commit message (uses default)
    try {
      await runGitCommand(`revert --no-edit ${commitHash}`);
      return { success: true };
    } catch (revertError: any) {
      // Check if we are in a conflict state
      const conflictedResult = await getConflictedFiles();

      if (conflictedResult.success && conflictedResult.files && conflictedResult.files.length > 0) {
        return { success: false, error: 'Revert conflict detected. Please resolve conflicts.' };
      }

      return { success: false, error: revertError.message || revertError.stderr || 'Revert failed' };
    }
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function resetCommits(commitHash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    await runGitCommand(`reset --${mode} ${commitHash}`);
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getRevertStatus(): Promise<{ success: boolean; inProgress: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open', inProgress: false };
    }
    const revertHeadPath = path.join(currentRepoPath, '.git', 'REVERT_HEAD');
    return { success: true, inProgress: fs.existsSync(revertHeadPath) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error', inProgress: false };
  }
}

export async function abortRevert(): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }
    await runGitCommand('revert --abort');
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function continueRevert(): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }
    await runGitCommand('revert --continue', undefined, { GIT_EDITOR: 'true' });
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function cherryPick(commitHash: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }
    // -x appends "(cherry picked from commit ...)" to the message
    await runGitCommand(`cherry-pick -x ${commitHash}`);
    return { success: true };
  } catch (error: any) {
    const errorMsg = error.message || error.stderr || 'Unknown error';
    if (errorMsg.includes('conflict') || errorMsg.includes('after resolving the conflicts')) {
      return { success: false, error: 'Cherry-pick paused due to conflicts' };
    }
    return { success: false, error: errorMsg };
  }
}

export async function abortCherryPick(): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }
    await runGitCommand('cherry-pick --abort');
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function continueCherryPick(): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }
    await runGitCommand('cherry-pick --continue', undefined, { GIT_EDITOR: 'true' });
    return { success: true };
  } catch (error: any) {
    const errorMsg = error.message || error.stderr || 'Unknown error';
    if (errorMsg.includes('conflict') || errorMsg.includes('resolve all conflicts')) {
      // Check if it's actually an empty commit error which contains "conflict resolution" text
      if (errorMsg.includes('The previous cherry-pick is now empty')) {
        // If empty, we can't continue a commit, so we must skip/reset or allow empty.
        // Usually usually users want to skip if it's already included.
        // Let's try to run with --allow-empty? Or just fail with specific message?
        return { success: false, error: 'The cherry-pick resulted in an empty commit (changes already exist?). Try aborting.' };
      }
      return { success: false, error: 'Cherry-pick paused due to conflicts' };
    }
    return { success: false, error: errorMsg };
  }
}

export async function skipCherryPick(): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }
    await runGitCommand('cherry-pick --skip');
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getCherryPickStatus(): Promise<{ success: boolean; inProgress: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open', inProgress: false };
    }
    const cherryPickHeadPath = path.join(currentRepoPath, '.git', 'CHERRY_PICK_HEAD');
    return { success: true, inProgress: fs.existsSync(cherryPickHeadPath) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error', inProgress: false };
  }
}

export interface RebaseTodoItem {
  action: 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop';
  hash: string;
  message: string;
}

export async function getCommitsForInteractiveRebase(targetBranch: string): Promise<{ success: boolean; commits?: RebaseTodoItem[]; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Get list of commits to be rebased: targetBranch..HEAD
    const { stdout } = await runGitCommand(`log ${targetBranch}..HEAD --pretty=format:"%H %s" --reverse`);

    const commits: RebaseTodoItem[] = stdout.split('\n').filter(l => l.trim()).map(line => {
      const parts = line.split(' ');
      const hash = parts[0];
      const message = parts.slice(1).join(' ');
      return {
        action: 'pick', // default action
        hash,
        message
      };
    });

    return { success: true, commits };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function performInteractiveRebase(targetBranch: string, todoLines: string[]): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Write todo list to temp file
    const tempTodoPath = path.join(currentRepoPath, '.git', 'rebase-todo-temp');
    fs.writeFileSync(tempTodoPath, todoLines.join('\n'));

    // Construct command to copy temp file to GIT_SEQUENCE_EDITOR argument
    // On Windows, use a node script to be safe across shells
    const nodeScript = `const fs = require('fs'); fs.copyFileSync('${tempTodoPath.replace(/\\/g, '\\\\')}', process.argv[2]);`;
    const editorCmd = `node -e "${nodeScript}"`;

    // We use process.argv[2] because git runs: EDITOR file
    // node -e "..." file
    // argv[0] is node, argv[1] is -e (or similar), argv[2] should be the file path?
    // Wait, node -e script_content arg1
    // inside script: process.argv[0] is node, process.argv[1] is the script content?
    // Let's verify node -e behavior.

    // Actually simpler: GIT_SEQUENCE_EDITOR="cp ${tempTodoPath} "
    // But cross platform...

    // Let's stick to node but be careful about argv.
    // node -e "console.log(process.argv)" a b
    // Output: [node_path, '-e', 'a', 'b']? No.
    // [node_path, a, b]?

    // I'll use a small intermediate JS file to be sure.
    const helperScriptPath = path.join(currentRepoPath, '.git', 'rebase-helper.js');
    const helperScript = `
      const fs = require('fs');
      const src = process.env.TEMP_TODO;
      const dest = process.argv[2]; // argv[0] is node, argv[1] is script path, argv[2] is the file passed by git
      fs.copyFileSync(src, dest);
    `;
    fs.writeFileSync(helperScriptPath, helperScript);

    const env = {
      ...process.env,
      TEMP_TODO: tempTodoPath,
      // Use our helper to replace the todo list
      GIT_SEQUENCE_EDITOR: `node "${helperScriptPath.replace(/\\/g, '\\\\')}"`,
      // Prevent git from opening an editor for squash/amend actions (auto-accept default)
      GIT_EDITOR: 'node -e "process.exit(0)"'
    };

    await runGitCommand(`rebase -i ${targetBranch}`, undefined, env);

    // Cleanup
    if (fs.existsSync(tempTodoPath)) fs.unlinkSync(tempTodoPath);
    if (fs.existsSync(helperScriptPath)) fs.unlinkSync(helperScriptPath);

    return { success: true };
  } catch (error: any) {
    const errorMsg = error.message || error.stderr || 'Unknown error';
    if (errorMsg.includes('conflict') || errorMsg.includes('resolve all conflicts')) {
      return { success: false, error: 'Rebase paused due to conflicts' };
    }
    return { success: false, error: errorMsg };
  }
}

export async function getFilesChurn(limit: number = 20): Promise<{ success: boolean; files?: Array<{ path: string; changes: number }>; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Use git log with --name-only, empty format, and merge filter to count file occurrences
    const { stdout } = await runGitCommand('log --name-only --format="" --no-merges');

    const fileCountMap = new Map<string, number>();
    const lines = stdout.split('\n');

    for (const line of lines) {
      const filePath = line.trim();
      if (filePath) {
        fileCountMap.set(filePath, (fileCountMap.get(filePath) || 0) + 1);
      }
    }

    const sortedFiles = Array.from(fileCountMap.entries())
      .map(([path, changes]) => ({ path, changes }))
      .sort((a, b) => b.changes - a.changes)
      .slice(0, limit);

    return { success: true, files: sortedFiles };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getCommitActivity(): Promise<{ success: boolean; activity?: Array<{ day: number; hour: number; count: number }>; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const { stdout } = await runGitCommand('log --format="%ad" --date=iso');
    const lines = stdout.split('\n').filter(l => l.trim());

    const activityMap = new Map<string, number>();

    for (const line of lines) {
      const date = new Date(line);
      if (!isNaN(date.getTime())) {
        const day = date.getDay(); // 0 is Sunday, 6 is Saturday
        const hour = date.getHours();
        const key = `${day}-${hour}`;
        activityMap.set(key, (activityMap.get(key) || 0) + 1);
      }
    }

    const activity = Array.from(activityMap.entries()).map(([key, count]) => {
      const [day, hour] = key.split('-').map(Number);
      return { day, hour, count };
    });

    return { success: true, activity };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getTopContributors(limit: number = 10): Promise<{ success: boolean; contributors?: Array<{ name: string; commits: number }>; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const { stdout } = await runGitCommand('shortlog -sn --all');

    const contributors = stdout
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        const match = line.match(/^\s*(\d+)\s+(.+)$/);
        if (match) {
          return {
            commits: parseInt(match[1], 10),
            name: match[2].trim()
          };
        }
        return null;
      })
      .filter(c => c !== null)
      .slice(0, limit) as Array<{ name: string; commits: number }>;

    return { success: true, contributors };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getCodebaseGrowth(): Promise<{ success: boolean; growth?: Array<{ date: string; additions: number; deletions: number; totalLines: number }>; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // This command gets number of additions/deletions per file per commit, along with the date
    const { stdout } = await runGitCommand('log --numstat --format="%ad" --date=short --reverse');

    const lines = stdout.split('\n');
    let currentDate = '';

    // Group by date to reduce data points
    const growthMap = new Map<string, { additions: number; deletions: number }>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // If the line looks like a date (e.g. 2023-10-25)
      if (/^\s*\d{4}-\d{2}-\d{2}\s*$/.test(trimmed)) {
        currentDate = trimmed;
        if (!growthMap.has(currentDate)) {
          growthMap.set(currentDate, { additions: 0, deletions: 0 });
        }
        continue;
      }

      // If it's a numstat line: "additions\tdeletions\tfile"
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2 && currentDate) {
        // - indicates binary files, which we ignore for line counts
        if (parts[0] === '-' || parts[1] === '-') continue;

        const additions = parseInt(parts[0], 10);
        const deletions = parseInt(parts[1], 10);

        if (!isNaN(additions) && !isNaN(deletions)) {
          const current = growthMap.get(currentDate)!;
          current.additions += additions;
          current.deletions += deletions;
        }
      }
    }

    let totalLines = 0;
    const growth = Array.from(growthMap.entries())
      .map(([date, stats]) => {
        totalLines += (stats.additions - stats.deletions);
        // Ensure totalLines doesn't go negative conceptually (though git could start with deletes if rebasing weirdly)
        if (totalLines < 0) totalLines = 0;
        return {
          date,
          additions: stats.additions,
          deletions: stats.deletions,
          totalLines
        };
      });

    return { success: true, growth };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function getFileTypeDistribution(): Promise<{ success: boolean; distribution?: Array<{ type: string; count: number }>; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const { stdout } = await runGitCommand('ls-tree -r HEAD --name-only');
    const lines = stdout.split('\n').filter(l => l.trim());

    const extMap = new Map<string, number>();

    for (const filePath of lines) {
      // Find the last dot to get extension
      const lastDotIndex = filePath.lastIndexOf('.');
      let type = 'Other';

      if (lastDotIndex > 0 && lastDotIndex < filePath.length - 1) {
        const ext = filePath.substring(lastDotIndex + 1).toLowerCase();
        // Ignore known hidden or binary or unimportant extensions if we want, but let's map them
        if (ext.length <= 5 && /^[a-z0-9]+$/.test(ext)) {
          type = '.' + ext;
        }
      }

      extMap.set(type, (extMap.get(type) || 0) + 1);
    }

    // Sort logic to handle "Other" and biggest first
    const distribution = Array.from(extMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // Group small extensions into "Other"? Let's just return all or top 20
    const top20 = distribution.slice(0, 20);

    return { success: true, distribution: top20 };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export interface BlameLine {
  commitHash: string;
  author: string;
  date: string;
  lineNo: number;
  content: string;
}

export async function getFileBlame(filePath: string, commitHash?: string): Promise<{ success: boolean; blame?: BlameLine[]; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const command = commitHash
      ? `blame --line-porcelain ${commitHash} -- "${filePath}"`
      : `blame --line-porcelain -- "${filePath}"`;

    const { stdout } = await runGitCommand(command);
    if (!stdout.trim()) {
      return { success: true, blame: [] };
    }

    const lines = stdout.split('\n');
    const result: BlameLine[] = [];
    let currentLine: Partial<BlameLine> = {};

    for (const line of lines) {
      if (line.startsWith('\t')) {
        currentLine.content = line.substring(1);
        if (currentLine.commitHash && currentLine.lineNo) {
          result.push({
            commitHash: currentLine.commitHash,
            author: currentLine.author || 'Unknown',
            date: currentLine.date || new Date().toISOString(),
            lineNo: currentLine.lineNo,
            content: currentLine.content
          });
        }
        currentLine = {};
      } else if (!currentLine.commitHash && /^[0-9a-f]{40} \d+ \d+/.test(line)) {
        const parts = line.split(' ');
        currentLine.commitHash = parts[0];
        currentLine.lineNo = parseInt(parts[2], 10);
      } else if (line.startsWith('author ')) {
        currentLine.author = line.substring(7);
      } else if (line.startsWith('author-time ')) {
        const timestamp = parseInt(line.substring(12), 10);
        currentLine.date = new Date(timestamp * 1000).toISOString();
      }
    }

    return { success: true, blame: result };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

// -----------------------------------------------------------------------------
// Git Flow Integration
// -----------------------------------------------------------------------------

export async function checkGitFlowInitialized(): Promise<{ success: boolean; initialized?: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) return { success: false, error: 'No repository open' };
    
    try {
      // Check if gitflow prefixes are defined in the config
      const { stdout } = await runGitCommand('config --get-regexp ^gitflow\\.prefix');
      return { success: true, initialized: stdout.trim().length > 0 };
    } catch {
      return { success: true, initialized: false }; // Non-zero exit code means no config found
    }
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function initializeGitFlow(): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) return { success: false, error: 'No repository open' };
    
    // Find the primary branch (main or master)
    let masterBranch = 'main';
    try {
      await runGitCommand('show-ref --verify refs/heads/main');
    } catch {
      try {
        await runGitCommand('show-ref --verify refs/heads/master');
        masterBranch = 'master';
      } catch {
        // Neither exists, maybe it's completely empty or another name. Default to main.
      }
    }

    // Set standard gitflow config variables
    await runGitCommand(`config gitflow.branch.master ${masterBranch}`);
    await runGitCommand('config gitflow.branch.develop develop');
    await runGitCommand('config gitflow.prefix.feature feature/');
    await runGitCommand('config gitflow.prefix.bugfix bugfix/');
    await runGitCommand('config gitflow.prefix.release release/');
    await runGitCommand('config gitflow.prefix.hotfix hotfix/');
    await runGitCommand('config gitflow.prefix.support support/');
    await runGitCommand('config gitflow.prefix.versiontag ""');

    // Create develop branch from master if it doesn't exist
    try {
      await runGitCommand('show-ref --verify refs/heads/develop');
    } catch {
      await runGitCommand(`branch develop ${masterBranch}`);
    }
    
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export type GitFlowBranchType = 'feature' | 'bugfix' | 'release' | 'hotfix' | 'support';

export async function startGitFlowBranch(type: GitFlowBranchType, name: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) return { success: false, error: 'No repository open' };
    
    let baseBranchCmd = "config --get gitflow.branch.develop";
    if (type === 'hotfix') {
      baseBranchCmd = "config --get gitflow.branch.master";
    }

    let baseBranch = 'develop';
    if (type === 'hotfix') baseBranch = 'main';

    try {
      const { stdout } = await runGitCommand(baseBranchCmd);
      if (stdout.trim()) baseBranch = stdout.trim();
    } catch {
      // Config not found, fallback to defaults
    }
    
    await runGitCommand(`checkout -b ${type}/${name} ${baseBranch}`);
    
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function finishGitFlowBranch(type: GitFlowBranchType, name: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) return { success: false, error: 'No repository open' };
    
    let developBranch = 'develop';
    let masterBranch = 'main';
    
    try {
      const { stdout: devOut } = await runGitCommand("config --get gitflow.branch.develop");
      if (devOut.trim()) developBranch = devOut.trim();
      const { stdout: masterOut } = await runGitCommand("config --get gitflow.branch.master");
      if (masterOut.trim()) masterBranch = masterOut.trim();
    } catch {}

    const env = { 
      ...process.env, 
      GIT_MERGE_AUTOEDIT: 'no',
      GIT_EDITOR: 'node -e "process.exit(0)"' 
    };
    
    const targetBranch = `${type}/${name}`;

    if (type === 'feature' || type === 'bugfix' || type === 'support') {
      await runGitCommand(`checkout ${developBranch}`, currentRepoPath, env);
      await runGitCommand(`merge --no-ff "${targetBranch}"`, currentRepoPath, env);
      await runGitCommand(`branch -d "${targetBranch}"`, currentRepoPath, env);
    } else if (type === 'release' || type === 'hotfix') {
      await runGitCommand(`checkout ${masterBranch}`, currentRepoPath, env);
      await runGitCommand(`merge --no-ff "${targetBranch}"`, currentRepoPath, env);
      
      try {
        await runGitCommand(`tag -a "${name}" -m "Finish ${type} ${name}"`, currentRepoPath, env);
      } catch {}

      await runGitCommand(`checkout ${developBranch}`, currentRepoPath, env);
      await runGitCommand(`merge --no-ff "${targetBranch}"`, currentRepoPath, env);
      await runGitCommand(`branch -d "${targetBranch}"`, currentRepoPath, env);
    }

    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

// -----------------------------------------------------------------------------
// Git Submodules Integration
// -----------------------------------------------------------------------------

export interface SubmoduleStatus {
  name: string;
  path: string;
  url: string;
  commitHash: string;
  status: 'synced' | 'out-of-sync' | 'uninitialized' | 'conflict' | 'unknown';
}

export async function getSubmodules(): Promise<{ success: boolean; submodules?: SubmoduleStatus[]; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) return { success: false, error: 'No repository open' };
    
    const urlMap = new Map<string, string>();
    try {
      const { stdout: configOut } = await runGitCommand('config --file .gitmodules --get-regexp path');
      const lines = configOut.split('\n').filter(Boolean);
      for (const line of lines) {
        const match = line.match(/^submodule\.(.+)\.path\s+(.+)$/);
        if (match) {
          const [, name, smPath] = match;
          try {
            const { stdout: urlOut } = await runGitCommand(`config --file .gitmodules --get submodule.${name}.url`);
            urlMap.set(smPath.trim(), urlOut.trim());
          } catch {}
        }
      }
    } catch {
      // Likely no .gitmodules file present
      return { success: true, submodules: [] };
    }

    const { stdout: statusOut } = await runGitCommand('submodule status');
    const smLines = statusOut.split('\n').filter(Boolean);
    const submodules: SubmoduleStatus[] = smLines.map(line => {
      const statusChar = line.charAt(0);
      const parts = line.substring(1).trim().split(' ');
      const commitHash = parts[0] ? parts[0].substring(0, 7) : '';
      const smPath = parts[1] || '';
      
      let status: SubmoduleStatus['status'] = 'synced';
      if (statusChar === '+') status = 'out-of-sync';
      else if (statusChar === '-') status = 'uninitialized';
      else if (statusChar === 'U') status = 'conflict';
      else if (statusChar !== ' ') status = 'unknown';

      return {
        name: smPath.split('/').pop() || smPath,
        path: smPath,
        url: urlMap.get(smPath) || '',
        commitHash,
        status
      };
    });

    return { success: true, submodules };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function addSubmodule(url: string, smPath: string, applyConfigs: boolean = false): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) return { success: false, error: 'No repository open' };
    await runGitCommand(`submodule add "${url}" "${smPath}"`);
    
    if (applyConfigs) {
      await runGitCommand('config --local submodule.recurse true').catch(() => {});
      await runGitCommand('config --local push.recurseSubmodules on-demand').catch(() => {});
    }

    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function updateSubmodules(): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) return { success: false, error: 'No repository open' };
    await runGitCommand('submodule update --init --recursive');
    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

export async function removeSubmodule(smPath: string): Promise<{ success: boolean; error?: string; errorType?: string }> {
  try {
    if (!currentRepoPath) return { success: false, error: 'No repository open' };
    
    // 1. Deinit
    await runGitCommand(`submodule deinit -f -- "${smPath}"`).catch(() => {});
    
    // 2. Remove from index via git rm
    await runGitCommand(`rm -f "${smPath}"`).catch(() => {});
    
    // 3. Purge cache physically native to Node
    const absoluteDotGitModulesPath = path.join(currentRepoPath, '.git', 'modules', smPath);
    if (fs.existsSync(absoluteDotGitModulesPath)) {
      await fs.promises.rm(absoluteDotGitModulesPath, { recursive: true, force: true });
    }

    return { success: true };
  } catch (error: any) {
    const parsed = parseGitError(error);
    return { success: false, error: parsed.message || 'Unknown error', errorType: parsed.type };
  }
}

function fixPath() {
  if (os.platform() === 'win32') return process.env;

  const extraPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ];

  const currentPath = process.env.PATH || '';
  const pathSeparator = ':';
  const existingPaths = new Set(currentPath.split(pathSeparator));
  
  const newPaths = [...existingPaths];
  for (const p of extraPaths) {
    if (!existingPaths.has(p) && fs.existsSync(p)) {
      newPaths.push(p);
    }
  }

  return {
    ...process.env,
    PATH: newPaths.join(pathSeparator)
  };
}

export async function generateCommitMessage(): Promise<{ success: boolean; message?: string; error?: string }> {
  let tempDiffFile: string | null = null;
  try {
    if (!currentRepoPath) return { success: false, error: 'No repository open' };

    // 1. Get staged changes
    const { stdout: diff } = await runGitCommand('diff --cached');
    if (!diff.trim()) {
      return { success: false, error: 'No staged changes found. Please stage changes before generating a commit message.' };
    }

    // 2. Write diff to a temporary file to avoid shell escaping issues
    tempDiffFile = path.join(os.tmpdir(), `gitzen-diff-${Date.now()}.txt`);
    fs.writeFileSync(tempDiffFile, diff);

    const prompt = "Write a concise commit message for these changes. Output ONLY the raw commit message without any markdown formatting, prefixes like 'Subject:', or explanations.";
    const platform = os.platform();
    
    let command = '';
    const env = fixPath();

    if (platform === 'win32') {
      // PowerShell script reading from temp file
      const escapedTempPath = tempDiffFile.replace(/'/g, "''");
      command = `powershell.exe -Command "if (Get-Command gemini -ErrorAction SilentlyContinue) { Get-Content -Raw -Path '${escapedTempPath}' | gemini ask $env:GITZEN_PROMPT } elseif (Get-Command claude -ErrorAction SilentlyContinue) { Get-Content -Raw -Path '${escapedTempPath}' | claude $env:GITZEN_PROMPT } elseif (Get-Command gh -ErrorAction SilentlyContinue) { Get-Content -Raw -Path '${escapedTempPath}' | gh copilot suggest -t 'git commit message' } else { Write-Error 'No supported AI CLI found (gemini, claude, or gh copilot).' }"`;
    } else {
      // Bash script reading from temp file
      command = `
if command -v gemini &> /dev/null; then
  cat "${tempDiffFile}" | gemini ask "$GITZEN_PROMPT"
elif command -v claude &> /dev/null; then
  cat "${tempDiffFile}" | claude "$GITZEN_PROMPT"
elif command -v gh &> /dev/null && gh copilot --help &> /dev/null; then
  cat "${tempDiffFile}" | gh copilot suggest -t "git commit message"
else
  echo "Error: No supported AI CLI found (gemini, claude, or gh copilot)." >&2
  exit 1
fi
`.trim();
    }

    // Execute the constructed script with the prompt in an environment variable
    const { stdout: aiOutput } = await execAsync(command, { 
      cwd: currentRepoPath,
      env: { ...env, GITZEN_PROMPT: prompt }
    });
    
    // Clean up the output (remove extra whitespace, markdown blocks, etc.)
    let finalMessage = aiOutput.trim();
    // Remove markdown code blocks if present
    finalMessage = finalMessage.replace(/^```[a-z]*\n([\s\S]*)\n```$/i, '$1').trim();
    // Remove leading "Commit message:" or similar common prefixes if AI is talkative
    finalMessage = finalMessage.replace(/^(commit message|message|subject|title):\s*/i, '').trim();

    if (!finalMessage) {
      return { success: false, error: 'AI failed to generate a message.' };
    }

    return { success: true, message: finalMessage };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  } finally {
    // Clean up temporary file
    if (tempDiffFile && fs.existsSync(tempDiffFile)) {
      try {
        fs.unlinkSync(tempDiffFile);
      } catch (e) {
        console.error('Failed to delete temporary diff file:', e);
      }
    }
  }
}
