import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { CredentialManager } from './CredentialManager';

const execAsync = promisify(exec);

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
      const match = line.match(/^(.{2})\s+(.+)$/);
      if (match) {
        const [, status, filePath] = match;
        const indexStatus = status[0];
        const worktreeStatus = status[1];

        let statusType: 'modified' | 'added' | 'deleted' = 'modified';
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

    for (const filePath of filePaths) {
      await runGitCommand(`add "${filePath}"`);
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

export async function getHistory(maxCount: number = 50): Promise<{ success: boolean; commits?: Array<{ id: string; message: string; author: string; timestamp: Date; branch: string; hash: string; lane: number }>; error?: string }> {
  try {
    if (!currentRepoPath) {
      return { success: false, error: 'No repository open' };
    }

    const currentBranchResult = await getCurrentBranch();
    const currentBranch = currentBranchResult.branch || 'main';
    
    // Get commits with branch information using --decorate
    // Format: %H|%s|%an|%ad|%D where %D shows refs (branches, tags)
    // Use --all to see all branches, but we'll filter to show current branch's perspective
    const { stdout } = await runGitCommand(`log --max-count=${maxCount} --pretty=format:"%H|%s|%an|%ad|%D" --date=iso --all --decorate`);
    
    const commits = stdout.trim().split('\n')
      .filter(line => line.trim())
      .map((line) => {
        const parts = line.split('|');
        const hash = parts[0];
        const message = parts[1] || 'No message';
        const author = parts[2] || 'Unknown';
        const dateStr = parts[3];
        const refs = (parts[4] || '').trim(); // Branch/tag information
        
        // Extract branch name from refs
        // Refs format: "HEAD -> branch-name, origin/branch-name, tag: v1.0"
        let branchName = currentBranch; // Default to current branch
        
        if (refs) {
          // Parse refs to find local branch names
          // Split by comma and process each ref
          const refParts = refs.split(',').map(r => r.trim());
          
          for (const ref of refParts) {
            // Skip remote branches and tags
            if (ref.includes('/') || ref.startsWith('tag:')) {
              continue;
            }
            
            // Check for "HEAD -> branch-name" format
            if (ref.includes('HEAD -> ')) {
              const match = ref.match(/HEAD -> (.+)/);
              if (match) {
                branchName = match[1].trim();
                break;
              }
            } else {
              // Direct branch name
              branchName = ref;
              break;
            }
          }
        }
        
        return {
          id: hash.substr(0, 7),
          message: message || 'No message',
          author: author || 'Unknown',
          timestamp: new Date(dateStr),
          branch: branchName,
          hash: hash.substr(0, 7),
          lane: 0,
        };
      });

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

    const { stdout } = await runGitCommand('branch --list');
    const branches = stdout.trim().split('\n')
      .map(b => b.replace(/^\*\s*/, '').trim())
      .filter(b => b);
    
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

    await runGitCommand(`checkout ${name}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
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

