import { exec, execSync, execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { shell } from 'electron';
import { CredentialManager } from './CredentialManager';
import * as settingsService from './settingsService';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

let currentRepoPath: string | null = null;
let credentialManager: CredentialManager | null = null;

export function initializeGitService() {
  credentialManager = new CredentialManager();
}

async function runGitCommand(command: string, cwd?: string, env?: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
  const repoPath = cwd || currentRepoPath;
  if (!repoPath) {
    throw new Error('No repository open');
  }
  
  return await execAsync(`git ${command}`, {
    cwd: repoPath,
    maxBuffer: 10 * 1024 * 1024, // 10MB
    env: { ...process.env, ...env },
  });
}

export async function cloneRepository(url: string, localPath: string, credentials?: { username: string; password: string }): Promise<{ success: boolean; error?: string }> {
  try {
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let cloneUrl = url;
    if (credentials) {
      // Embed credentials in URL
      const urlObj = new URL(url);
      urlObj.username = credentials.username;
      urlObj.password = credentials.password;
      cloneUrl = urlObj.toString();
    }

    await execAsync(`git clone ${cloneUrl} ${localPath}`, {
      maxBuffer: 10 * 1024 * 1024,
    });

    currentRepoPath = localPath;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function createStash(): Promise<{ success: boolean; error?: string }> {
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
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function getStashes(): Promise<{ success: boolean; stashes?: { name: string; message: string }[]; error?: string }> {
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
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function applyStash(stashRef: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }
    await runGitCommand(`stash apply "${stashRef}"`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function deleteStash(stashRef: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }
    await runGitCommand(`stash drop "${stashRef}"`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function openRepository(repoPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!fs.existsSync(path.join(repoPath, '.git'))) {
      return { success: false, error: 'Not a git repository' };
    }
    currentRepoPath = repoPath;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function getStatus(): Promise<{ success: boolean; files?: Array<{ path: string; status: 'modified' | 'added' | 'deleted'; staged: boolean }>; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const { stdout } = await runGitCommand('status --porcelain');
    const files: Array<{ path: string; status: 'modified' | 'added' | 'deleted'; staged: boolean }> = [];

    for (const line of stdout.trim().split('\n').filter(l => l)) {
      // Git porcelain format: XY filename
      // X = index status, Y = worktree status
      // Format is always 2 chars, then space(s), then filename
      // Handle cases where there might be extra spaces or the format varies slightly
      const match = line.match(/^(.{1,2})\s+(.+)$/);
      if (match) {
        let status = match[1];
        let filePath = match[2];
        
        // Git may quote filenames with special characters - remove surrounding quotes
        if ((filePath.startsWith('"') && filePath.endsWith('"')) ||
            (filePath.startsWith("'") && filePath.endsWith("'"))) {
          filePath = filePath.slice(1, -1);
        }
        
        // Ensure status is always 2 characters (pad with space if needed)
        if (status.length === 1) {
          status = ' ' + status;
        }
        
        const indexStatus = status[0];
        const worktreeStatus = status[1];

        let statusType: 'modified' | 'added' | 'deleted' = 'added';
        if (indexStatus === 'A' || worktreeStatus === 'A') {
          statusType = 'added';
        } else if (indexStatus === 'D' || worktreeStatus === 'D') {
          statusType = 'deleted';
        } else if (indexStatus === 'M' || worktreeStatus === 'M') {
          statusType = 'modified';
        }

        files.push({
          path: filePath,
          status: statusType,
          staged: indexStatus !== ' ' && indexStatus !== '?',
        });
      }
    }

    return { success: true, files };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function stageFiles(filePaths: string[]): Promise<{ success: boolean; error?: string }> {
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
    for (const filePath of filePaths) {
      const fileStatus = fileStatusMap.get(filePath);
      
      // For deleted files that were previously tracked, use git rm to stage the deletion
      // For new files or modified files, use git add
      if (fileStatus === 'deleted') {
        // Use git rm for deleted files - this stages the deletion
        await execFileAsync('git', ['rm', '--', filePath], {
          cwd: currentRepoPath,
          maxBuffer: 10 * 1024 * 1024,
        });
      } else {
        // Use git add for new or modified files
        await execFileAsync('git', ['add', '--', filePath], {
          cwd: currentRepoPath,
          maxBuffer: 10 * 1024 * 1024,
        });
      }
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function stageAll(): Promise<{ success: boolean; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    await runGitCommand('add -A');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function unstageFiles(filePaths: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Use execFile with argument array to avoid shell quoting issues with special characters
    // The -- separator tells git that everything after is a file path
    for (const filePath of filePaths) {
      await execFileAsync('git', ['reset', 'HEAD', '--', filePath], {
        cwd: currentRepoPath,
        maxBuffer: 10 * 1024 * 1024,
      });
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function commit(message: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const escapedMessage = message.replace(/"/g, '\\"');
    await runGitCommand(`commit -m "${escapedMessage}"`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function push(remote: string = 'origin', branch?: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Get remote URL to check for credentials
    const { stdout: remoteUrl } = await runGitCommand(`remote get-url ${remote}`);
    const url = remoteUrl.trim();
    
    // Try to get credentials
    if (credentialManager) {
      const creds = await credentialManager.getRemoteCredentials(url);
      if (creds?.username && creds?.password) {
        // Convert SSH URL to HTTPS if needed, or embed credentials
        let urlWithCreds = url;
        if (url.startsWith('git@') || url.startsWith('ssh://')) {
          // Convert SSH to HTTPS
          urlWithCreds = url
            .replace(/^git@/, 'https://')
            .replace(/^ssh:\/\//, 'https://')
            .replace(/:([^\/]+)\//, '/$1/');
        }
        
        try {
          const urlObj = new URL(urlWithCreds);
          urlObj.username = creds.username;
          urlObj.password = creds.password;
          // Temporarily update remote URL with credentials
          await runGitCommand(`remote set-url ${remote} ${urlObj.toString()}`);
          try {
            const branchName = branch || await getCurrentBranch().then(r => r.branch || 'main');
            await runGitCommand(`push ${remote} ${branchName}`);
            // Restore original URL
            await runGitCommand(`remote set-url ${remote} ${url}`);
            return { success: true };
          } catch (error) {
            // Restore original URL on error
            await runGitCommand(`remote set-url ${remote} ${url}`);
            throw error;
          }
        } catch (urlError) {
          // If URL parsing fails, try without credentials
          console.warn('Failed to parse URL with credentials, trying without:', urlError);
        }
      }
    }

    const branchName = branch || await getCurrentBranch().then(r => r.branch || 'main');
    await runGitCommand(`push ${remote} ${branchName}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function pull(remote: string = 'origin', branch?: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Get remote URL to check for credentials
    const { stdout: remoteUrl } = await runGitCommand(`remote get-url ${remote}`);
    const url = remoteUrl.trim();
    
    // Try to get credentials
    if (credentialManager) {
      const creds = await credentialManager.getRemoteCredentials(url);
      if (creds?.username && creds?.password) {
        // Convert SSH URL to HTTPS if needed
        let urlWithCreds = url;
        if (url.startsWith('git@') || url.startsWith('ssh://')) {
          urlWithCreds = url
            .replace(/^git@/, 'https://')
            .replace(/^ssh:\/\//, 'https://')
            .replace(/:([^\/]+)\//, '/$1/');
        }
        
        try {
          const urlObj = new URL(urlWithCreds);
          urlObj.username = creds.username;
          urlObj.password = creds.password;
          await runGitCommand(`remote set-url ${remote} ${urlObj.toString()}`);
          try {
            const branchName = branch || await getCurrentBranch().then(r => r.branch || 'main');
            await runGitCommand(`pull ${remote} ${branchName}`);
            await runGitCommand(`remote set-url ${remote} ${url}`);
            return { success: true };
          } catch (error) {
            await runGitCommand(`remote set-url ${remote} ${url}`);
            throw error;
          }
        } catch (urlError) {
          console.warn('Failed to parse URL with credentials, trying without:', urlError);
        }
      }
    }

    const branchName = branch || await getCurrentBranch().then(r => r.branch || 'main');
    await runGitCommand(`pull ${remote} ${branchName}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function getCurrentBranch(): Promise<{ success: boolean; branch?: string; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const { stdout } = await runGitCommand('branch --show-current');
    return { success: true, branch: stdout.trim() };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function hasUnpushedCommits(): Promise<{ success: boolean; hasUnpushed?: boolean; count?: number; error?: string }> {
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
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function mergeBranchToCurrent(branchToMerge: string): Promise<{ success: boolean; hasConflicts?: boolean; conflictedFiles?: string[]; error?: string }> {
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
      await execFileAsync('git', ['merge', branchToMerge, '--no-ff', '-m', mergeMessage], {
        cwd: currentRepoPath,
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
            error: `Merge conflict occurred while merging ${branchToMerge}` 
          };
        }
        // In merge state but no conflicted files (shouldn't happen, but handle gracefully)
        return { 
          success: false, 
          hasConflicts: true,
          conflictedFiles: [],
          error: `Merge conflict occurred while merging ${branchToMerge}` 
        };
      }
      // Not in merge state, so this is a different kind of error
      const errorMessage = mergeError.message || mergeError.stderr || 'Unknown merge error';
      return { success: false, error: errorMessage };
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function getHistory(maxCount: number = 50): Promise<{
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
  error?: string
}> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Use configured max commits (defaults to 30)
    const configuredMaxCommits = settingsService.getMaxCommits();
    const diagramMaxCount = Math.min(maxCount, configuredMaxCommits);

    // Use --all to show all branches regardless of which branch is checked out
    const { stdout } = await runGitCommand(`log -n ${diagramMaxCount} --all --date-order --pretty=format:"%H|%s|%an|%ad|%D|%P" --date=iso`);

    const lines = stdout.trim().split('\n').filter(line => line.trim());

    // Build a map of commit hash to branch name
    const commitToBranch: Record<string, string> = {};

    // First pass: collect branch info from refs
    for (const line of lines) {
      const parts = line.split('|');
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
        const parts = line.split('|');
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
      const parts = line.split('|');
      if (parts.length < 5) continue;

      const hash = parts[0].trim();
      const message = parts[1] || 'No message';
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

    return { success: true, commits };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}


export async function getBranches(): Promise<{ success: boolean; branches?: string[]; error?: string }> {
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
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function createBranch(name: string, checkout: boolean = true): Promise<{ success: boolean; error?: string }> {
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
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function checkoutBranch(name: string): Promise<{ success: boolean; error?: string }> {
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
          await execFileAsync('git', ['checkout', branchName], {
            cwd: currentRepoPath,
            maxBuffer: 10 * 1024 * 1024,
          });
          return { success: true };
        } catch (checkoutError: any) {
          // If branch doesn't exist locally, create it from remote
          // Use -b to create a new branch and set up tracking
          await execFileAsync('git', ['checkout', '-b', branchName, `${remoteName}/${branchName}`], {
            cwd: currentRepoPath,
            maxBuffer: 10 * 1024 * 1024,
          });
          return { success: true };
        }
      }
    }
    
    // Local branch checkout (either no slash, or slash but not a remote branch)
    await execFileAsync('git', ['checkout', name], {
      cwd: currentRepoPath,
      maxBuffer: 10 * 1024 * 1024,
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

async function validateCredentials(remoteUrl: string, username: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Convert SSH URL to HTTPS if needed for credential testing
    let testUrl = remoteUrl;
    if (testUrl.startsWith('git@') || testUrl.startsWith('ssh://')) {
      testUrl = testUrl
        .replace(/^git@/, 'https://')
        .replace(/^ssh:\/\//, 'https://')
        .replace(/:([^\/]+)\//, '/$1/');
    }

    // Create URL with credentials - escape special characters in username/password
    try {
      const urlObj = new URL(testUrl);
      urlObj.username = encodeURIComponent(username);
      urlObj.password = encodeURIComponent(password);
      const urlWithCreds = urlObj.toString();

      // Test credentials by attempting to list remote refs
      // Use --exit-code to ensure git returns non-zero on failure
      try {
        const result = await execAsync(`git ls-remote --exit-code "${urlWithCreds}"`, {
          timeout: 10000, // 10 second timeout
          maxBuffer: 1024 * 1024, // 1MB
        });
        
        // Check if we got any output (empty output might indicate auth failure)
        if (!result.stdout || result.stdout.trim().length === 0) {
          return { success: false, error: 'Authentication failed: No access to repository' };
        }
        
        return { success: true };
      } catch (error: any) {
        const errorMsg = error.message || error.stderr || String(error);
        const errorCode = error.code;
        
        // Check for authentication-related errors
        if (errorCode === 128 || // Git error code for authentication failures
            errorMsg.includes('Authentication failed') || 
            errorMsg.includes('fatal: could not read Username') ||
            errorMsg.includes('fatal: could not read Password') ||
            errorMsg.includes('Permission denied') ||
            errorMsg.includes('401') ||
            errorMsg.includes('403') ||
            errorMsg.includes('Unauthorized') ||
            errorMsg.includes('authentication failed') ||
            errorMsg.includes('Invalid username or password') ||
            errorMsg.includes('remote: Invalid username or password') ||
            errorMsg.includes('remote: Authentication failed')) {
          return { success: false, error: 'Authentication failed: Invalid username or password' };
        }
        
        // For other errors, still fail but with more context
        return { success: false, error: `Failed to validate credentials: ${errorMsg}` };
      }
    } catch (urlError) {
      return { success: false, error: `Invalid remote URL: ${urlError instanceof Error ? urlError.message : String(urlError)}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error during validation' };
  }
}

export async function saveCredentials(remoteUrl: string, username: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!credentialManager) {
      credentialManager = new CredentialManager();
    }

    // First, delete any existing credentials for this remote
    try {
      await credentialManager.deleteRemoteCredentials(remoteUrl);
    } catch (error) {
      // Ignore errors when deleting (might not exist)
    }

    // Validate credentials before saving
    const validation = await validateCredentials(remoteUrl, username, password);
    
    if (!validation.success) {
      // Don't save invalid credentials
      return { success: false, error: validation.error || 'Credential validation failed' };
    }

    // Save credentials only if validation succeeds
    await credentialManager.storeRemoteCredentials(remoteUrl, {
      username,
      password,
    });

    return { success: true };
  } catch (error: any) {
    // If saving fails, make sure credentials are deleted
    try {
      if (credentialManager) {
        await credentialManager.deleteRemoteCredentials(remoteUrl);
      }
    } catch (deleteError) {
      // Ignore delete errors
    }
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function hasCredentials(remoteUrl: string): Promise<{ success: boolean; hasCredentials: boolean; error?: string }> {
  try {
    if (!credentialManager) {
      credentialManager = new CredentialManager();
    }

    const creds = await credentialManager.getRemoteCredentials(remoteUrl);
    return { success: true, hasCredentials: creds !== null };
  } catch (error: any) {
    return { success: false, hasCredentials: false, error: error.message || 'Unknown error' };
  }
}

export async function validateExistingCredentials(remoteUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!credentialManager) {
      credentialManager = new CredentialManager();
    }

    const creds = await credentialManager.getRemoteCredentials(remoteUrl);
    if (!creds || !creds.username || !creds.password) {
      return { success: false, error: 'No credentials found' };
    }

    // Validate the existing credentials
    return await validateCredentials(remoteUrl, creds.username, creds.password);
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function deleteCredentials(remoteUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!credentialManager) {
      credentialManager = new CredentialManager();
    }

    await credentialManager.deleteRemoteCredentials(remoteUrl);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export function getRepoPath(): { success: boolean; path?: string; error?: string } {
  if (currentRepoPath) {
    return { success: true, path: currentRepoPath };
  }
  return { success: false, error: 'No repository open' };
}

export async function getRepoName(): Promise<{ success: boolean; name?: string; error?: string }> {
  if (!currentRepoPath) {
    return { success: false, error: 'No repository open' };
  }

  try {
    const name = path.basename(currentRepoPath);
    return { success: true, name };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function getRemoteUrl(remote: string = 'origin'): Promise<{ success: boolean; url?: string; error?: string }> {
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

export async function getRemoteBranches(): Promise<{ success: boolean; branches?: Array<{ name: string; remote: string }>; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }
    await runGitCommand('fetch --all');
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
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function getTags(): Promise<{ success: boolean; tags?: Array<{ name: string; commit: string; date: Date }>; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const { stdout } = await runGitCommand('tag -l --format="%(refname:short)|%(objectname:short)|%(creatordate:iso8601)"');
    const tags = stdout
      .split('\n')
      .filter((line: string) => line.trim())
      .map((line: string) => {
        const [name, commit, dateStr] = line.split('|');
        return {
          name: name || '',
          commit: commit || '',
          date: dateStr ? new Date(dateStr) : new Date(),
        };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    return { success: true, tags };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function getCommitDiff(commitHash: string): Promise<{ success: boolean; files?: Array<{ path: string; status: 'modified' | 'added' | 'deleted'; additions: number; deletions: number; diff: string }>; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const { stdout: statOutput } = await runGitCommand(`show --stat --format="" ${commitHash}`);
    const { stdout: fullDiff } = await runGitCommand(`show ${commitHash}`);

    const diffLines = fullDiff.split('\n');
    const files: Array<{ path: string; status: 'modified' | 'added' | 'deleted'; additions: number; deletions: number; diff: string }> = [];
    
    let currentFile: { path: string; status: 'modified' | 'added' | 'deleted'; additions: number; deletions: number; diff: string } | null = null;
    let fileDiffStart = 0;

    for (let i = 0; i < diffLines.length; i++) {
      const line = diffLines[i];
      if (line.startsWith('diff --git')) {
        if (currentFile) {
          currentFile.diff = diffLines.slice(fileDiffStart, i).join('\n');
          files.push(currentFile);
        }
        fileDiffStart = i;
        const match = line.match(/diff --git a\/(.+) b\/(.+)/);
        if (match) {
          const oldPath = match[1];
          const newPath = match[2];
          currentFile = {
            path: newPath || oldPath,
            status: oldPath === '/dev/null' ? 'added' : newPath === '/dev/null' ? 'deleted' : 'modified',
            additions: 0,
            deletions: 0,
            diff: '',
          };
        }
      } else if (currentFile && (line.startsWith('+') && !line.startsWith('+++'))) {
        currentFile.additions++;
      } else if (currentFile && (line.startsWith('-') && !line.startsWith('---'))) {
        currentFile.deletions++;
      }
    }

    if (currentFile) {
      currentFile.diff = diffLines.slice(fileDiffStart).join('\n');
      files.push(currentFile);
    }

    return { success: true, files };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function deleteBranch(branchName: string, force: boolean = false): Promise<{ success: boolean; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const command = force ? `branch -D ${branchName}` : `branch -d ${branchName}`;
    await runGitCommand(command);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function deleteRemoteBranch(remoteBranchName: string): Promise<{ success: boolean; error?: string }> {
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

    // Delete remote branch using git push --delete
    await execFileAsync('git', ['push', remoteName, '--delete', branchName], {
      cwd: currentRepoPath,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function deleteTag(tagName: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    await runGitCommand(`tag -d ${tagName}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function revertFileChanges(filePath: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Use git checkout to revert changes (works for both modified and deleted files)
    // The -- flag tells git that everything after is a file path
    await execFileAsync('git', ['checkout', '--', filePath], {
      cwd: currentRepoPath,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function getConflictedFiles(): Promise<{ success: boolean; files?: string[]; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Check if we're in a merge or rebase state
    const mergeHeadPath = path.join(currentRepoPath, '.git', 'MERGE_HEAD');
    const rebaseMergePath = path.join(currentRepoPath, '.git', 'rebase-merge');
    const rebaseApplyPath = path.join(currentRepoPath, '.git', 'rebase-apply');

    if (!fs.existsSync(mergeHeadPath) && !fs.existsSync(rebaseMergePath) && !fs.existsSync(rebaseApplyPath)) {
      // Not in a known conflict state, but we can still check for unmerged files
      // return { success: false, error: 'Not in a merge or rebase state' };
    }

    // Get conflicted files using git status --porcelain
    // Conflicted files have status codes like: UU (both modified), AA (both added), DD (both deleted), AU, UA, DU, UD, etc.
    const { stdout } = await runGitCommand('status --porcelain');
    const conflictedFiles: string[] = [];

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
          // Skip if both are deleted (DD) as there's nothing to resolve
          if (indexStatus !== 'D' || worktreeStatus !== 'D') {
            conflictedFiles.push(filePath);
          }
        }
      }
    }

    return { success: true, files: conflictedFiles };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function abortMerge(): Promise<{ success: boolean; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Check if we're in a merge state
    const mergeHeadPath = path.join(currentRepoPath, '.git', 'MERGE_HEAD');
    if (!fs.existsSync(mergeHeadPath)) {
      return { success: false, error: 'Not in a merge state' };
    }

    await execFileAsync('git', ['merge', '--abort'], {
      cwd: currentRepoPath,
      maxBuffer: 10 * 1024 * 1024,
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function openFileInMergeTool(filePath: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const fullPath = path.join(currentRepoPath, filePath);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: 'File does not exist' };
    }

    // First, check if user has configured a custom merge tool path
    const customMergeToolPath = settingsService.getMergeToolPath();
    if (customMergeToolPath && fs.existsSync(customMergeToolPath)) {
      try {
        // Execute the custom merge tool with the file path
        await execFileAsync(customMergeToolPath, [fullPath], {
          cwd: currentRepoPath,
          maxBuffer: 10 * 1024 * 1024,
        });
        return { success: true };
      } catch (customToolError: any) {
        // If custom tool fails, fall through to other options
        console.warn('Custom merge tool failed, trying alternatives:', customToolError.message);
      }
    }

    // Try to use git mergetool, which respects user's merge.tool configuration
    try {
      await execFileAsync('git', ['mergetool', '--', filePath], {
        cwd: currentRepoPath,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { success: true };
    } catch (mergetoolError: any) {
      // If mergetool fails (e.g., not configured), try to open the file with the system default application
      try {
        const error = await shell.openPath(fullPath);
        if (error) {
          throw new Error(error);
        }
        return { success: true };
      } catch (openError: any) {
        // Final fallback: try to use system commands
        const platform = process.platform;
        let command: string;
        if (platform === 'win32') {
          command = `start "" "${fullPath}"`;
        } else if (platform === 'darwin') {
          command = `open "${fullPath}"`;
        } else {
          command = `xdg-open "${fullPath}"`;
        }

        await execAsync(command, {
          maxBuffer: 10 * 1024 * 1024,
        });

        return { success: true };
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function deleteFile(filePath: string): Promise<{ success: boolean; error?: string }> {
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
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function getTagsForCommit(commitHash: string): Promise<{ success: boolean; tags?: string[]; error?: string }> {
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
    return { success: false, error: error.message || 'Unknown error' };
  }
}

/**
 * Tests if Git can authenticate to a remote using built-in credential mechanisms
 * (credential helper, SSH keys, etc.) without explicit credentials
 */
export async function testGitCredentials(remoteUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    // Try git ls-remote without explicit credentials
    // Git will use credential helper, SSH keys, or other built-in mechanisms
    try {
      // Try git ls-remote without explicit credentials
      // Git will use credential helper, SSH keys, or prompt
      await runGitCommand(`ls-remote "${remoteUrl}"`);
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
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}


export async function rebaseBranch(branch: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    await runGitCommand(`rebase ${branch}`);
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

export async function abortRebase(): Promise<{ success: boolean; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }
    await runGitCommand('rebase --abort');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function continueRebase(): Promise<{ success: boolean; error?: string }> {
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

export async function getRebaseStatus(): Promise<{ success: boolean; inProgress: boolean; currentStep?: number; totalSteps?: number; error?: string }> {
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
      try {
        const msgNum = fs.readFileSync(path.join(rebaseMergePath, 'msgnum'), 'utf8').trim();
        const end = fs.readFileSync(path.join(rebaseMergePath, 'end'), 'utf8').trim();
        current = parseInt(msgNum, 10);
        total = parseInt(end, 10);
      } catch (e) {
        // ignore parsing errors
      }
      return { success: true, inProgress: true, currentStep: current, totalSteps: total };
    } else if (fs.existsSync(rebaseApplyPath)) {
       // Apply based rebase
       let current = 0;
       let total = 0;
       try {
         const next = fs.readFileSync(path.join(rebaseApplyPath, 'next'), 'utf8').trim();
         const last = fs.readFileSync(path.join(rebaseApplyPath, 'last'), 'utf8').trim();
         current = parseInt(next, 10);
         total = parseInt(last, 10);
       } catch (e) {
         // ignore
       }
       return { success: true, inProgress: true, currentStep: current, totalSteps: total };
    }

    return { success: true, inProgress: false };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error', inProgress: false };
  }
}

export interface RebaseTodoItem {
  action: 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop';
  hash: string;
  message: string;
}

export async function getCommitsForInteractiveRebase(targetBranch: string): Promise<{ success: boolean; commits?: RebaseTodoItem[]; error?: string }> {
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
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function performInteractiveRebase(targetBranch: string, todoLines: string[]): Promise<{ success: boolean; error?: string }> {
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
