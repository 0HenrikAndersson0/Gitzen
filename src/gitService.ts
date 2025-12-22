import { GitCommands } from './GitCommands';
import { CredentialManager } from './CredentialManager';
import * as path from 'path';
import * as fs from 'fs';
import * as Git from 'nodegit';

let gitCommands: GitCommands | null = null;
let credentialManager: CredentialManager | null = null;
let currentRepoPath: string | null = null;

export function initializeGitService() {
  credentialManager = new CredentialManager();
}

export async function cloneRepository(url: string, localPath: string, credentials?: { username: string; password: string }): Promise<{ success: boolean; error?: string }> {
  try {
    // Ensure directory exists
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    gitCommands = new GitCommands(localPath, credentialManager || undefined);
    
    await gitCommands.clone({
      url,
      localPath,
      credentials: credentials ? {
        username: credentials.username,
        password: credentials.password,
      } : undefined,
    });

    currentRepoPath = localPath;
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function openRepository(repoPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    gitCommands = new GitCommands(repoPath, credentialManager || undefined);
    await gitCommands.openRepository();
    currentRepoPath = repoPath;
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getStatus(): Promise<{ success: boolean; files?: Array<{ path: string; status: 'modified' | 'added' | 'deleted'; staged: boolean }>; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    const statuses = await gitCommands.getStatus();
    const files = statuses.map((status) => {
      let statusType: 'modified' | 'added' | 'deleted' = 'modified';
      if (status.isNew()) {
        statusType = 'added';
      } else if (status.isDeleted()) {
        statusType = 'deleted';
      } else if (status.isModified()) {
        statusType = 'modified';
      }

      return {
        path: status.path(),
        status: statusType,
        staged: status.inIndex(),
      };
    });

    return { success: true, files };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function stageFiles(filePaths: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    await gitCommands.stageFiles(filePaths);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function stageAll(): Promise<{ success: boolean; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    await gitCommands.stageAll();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function commit(message: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    await gitCommands.commit({ message });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function push(remote: string = 'origin', branch?: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    await gitCommands.push(remote, branch);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function pull(remote: string = 'origin', branch?: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    await gitCommands.pull(remote, branch);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getCurrentBranch(): Promise<{ success: boolean; branch?: string; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    const branch = await gitCommands.getCurrentBranch();
    return { success: true, branch };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getHistory(maxCount: number = 50): Promise<{ success: boolean; commits?: Array<{ id: string; message: string; author: string; timestamp: Date; branch: string; hash: string; lane: number }>; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    const gitCommits = await gitCommands.getHistory(maxCount);
    const currentBranch = await gitCommands.getCurrentBranch().catch(() => 'main');
    
    const commits = await Promise.all(gitCommits.map(async (commit, index) => {
      const author = commit.author();
      return {
        id: commit.sha().substr(0, 7),
        message: commit.message().split('\n')[0],
        author: author.name(),
        timestamp: commit.date(),
        branch: currentBranch,
        hash: commit.sha().substr(0, 7),
        lane: 0, // Simplified - in a real implementation, you'd calculate lanes based on branch structure
      };
    }));

    return { success: true, commits };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getBranches(): Promise<{ success: boolean; branches?: string[]; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    const branches = await gitCommands.listBranches();
    return { success: true, branches };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function createBranch(name: string, checkout: boolean = true): Promise<{ success: boolean; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    await gitCommands.createBranch(name, checkout);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function checkoutBranch(name: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    await gitCommands.checkoutBranch(name);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function validateCredentials(remoteUrl: string, username: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    // If we have a repository open, use nodegit via GitCommands
    if (gitCommands && currentRepoPath) {
      try {
        const isValid = await gitCommands.validateCredentials(remoteUrl, {
          username,
          password,
        });
        if (!isValid) {
          return { success: false, error: 'Authentication failed: Invalid username or password' };
        }
        return { success: true };
      } catch (error) {
        // If nodegit validation throws an error, it's likely an auth failure
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('Authentication') || 
            errorMsg.includes('401') ||
            errorMsg.includes('403') ||
            errorMsg.includes('Permission denied') ||
            errorMsg.includes('could not read Username') ||
            errorMsg.includes('could not read Password') ||
            errorMsg.includes('authentication failed') ||
            errorMsg.includes('Unauthorized')) {
          return { success: false, error: 'Authentication failed: Invalid username or password' };
        }
        // For other errors (network, etc.), fall through to child_process method
        console.log('Nodegit validation error (non-auth), falling back to child_process:', errorMsg);
      }
    }

    // Fallback to child_process if no repo is open or nodegit fails
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

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
  } catch (error) {
    // If saving fails, make sure credentials are deleted
    try {
      if (credentialManager) {
        await credentialManager.deleteRemoteCredentials(remoteUrl);
      }
    } catch (deleteError) {
      // Ignore delete errors
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function hasCredentials(remoteUrl: string): Promise<{ success: boolean; hasCredentials: boolean; error?: string }> {
  try {
    if (!credentialManager) {
      credentialManager = new CredentialManager();
    }

    const creds = await credentialManager.getRemoteCredentials(remoteUrl);
    return { success: true, hasCredentials: creds !== null };
  } catch (error) {
    return { success: false, hasCredentials: false, error: error instanceof Error ? error.message : 'Unknown error' };
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

    // If we have a repository open, use nodegit via GitCommands (preferred method)
    if (gitCommands && currentRepoPath) {
      try {
        const isValid = await gitCommands.validateCredentials(remoteUrl, {
          username: creds.username,
          password: creds.password,
        });
        if (!isValid) {
          return { success: false, error: 'Authentication failed: Invalid username or password' };
        }
        return { success: true };
      } catch (error) {
        // Check if it's an authentication error
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('Authentication') || 
            errorMsg.includes('401') ||
            errorMsg.includes('403') ||
            errorMsg.includes('Permission denied') ||
            errorMsg.includes('Unauthorized') ||
            errorMsg.includes('authentication failed')) {
          return { success: false, error: 'Authentication failed: Invalid username or password' };
        }
        // For other errors, fall through to child_process method
        console.log('Nodegit validation error (non-auth), falling back to child_process:', errorMsg);
      }
    }

    // Fallback to child_process validation (used when no repo is open or nodegit fails)
    return await validateCredentials(remoteUrl, creds.username, creds.password);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deleteCredentials(remoteUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!credentialManager) {
      credentialManager = new CredentialManager();
    }

    await credentialManager.deleteRemoteCredentials(remoteUrl);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
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
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getRemoteUrl(remote: string = 'origin'): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    const url = await gitCommands.getRemoteUrl(remote);
    return { success: true, url };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Remote not found' };
  }
}

export async function getRemoteBranches(): Promise<{ success: boolean; branches?: Array<{ name: string; remote: string }>; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    const branches = await gitCommands.listRemoteBranches();
    return { success: true, branches };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getTags(): Promise<{ success: boolean; tags?: Array<{ name: string; commit: string; date: Date }>; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    const tags = await gitCommands.listTags();
    return { success: true, tags };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getCommitDiff(commitHash: string): Promise<{ success: boolean; files?: Array<{ path: string; status: 'modified' | 'added' | 'deleted'; additions: number; deletions: number; diff: string }>; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    const files = await gitCommands.getCommitDiff(commitHash);
    return { success: true, files };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deleteBranch(branchName: string, force: boolean = false): Promise<{ success: boolean; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    await gitCommands.deleteBranch(branchName, force);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deleteTag(tagName: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    await gitCommands.deleteTag(tagName);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getTagsForCommit(commitHash: string): Promise<{ success: boolean; tags?: string[]; error?: string }> {
  try {
    if (!gitCommands) {
      return { success: false, error: 'No repository open' };
    }

    const tags = await gitCommands.getTagsForCommit(commitHash);
    return { success: true, tags };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
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

    // Try to use nodegit without explicit credentials - it will use Git's credential helper
    if (gitCommands) {
      try {
        // Create a temporary remote and try to fetch without credentials
        // This will use Git's built-in credential system
        const tempRemote = await Git.Remote.createAnonymous(gitCommands.getRepository()!, remoteUrl);
        
        const fetchOptions: Git.FetchOptions = {
          callbacks: {
            credentials: () => {
              // Return default credentials - this will use Git's credential helper
              return Git.Cred.defaultNew();
            }
          }
        };

        // Try a lightweight fetch operation
        await tempRemote.fetch([], fetchOptions, '');
        tempRemote.disconnect();
        
        return { success: true };
      } catch (error) {
        // If it fails, Git's credential system couldn't authenticate
        const errorMsg = error instanceof Error ? error.message : String(error);
        // Don't treat network errors as auth failures
        if (errorMsg.includes('Authentication') || 
            errorMsg.includes('401') ||
            errorMsg.includes('403') ||
            errorMsg.includes('Permission denied') ||
            errorMsg.includes('Unauthorized')) {
          return { success: false, error: 'Git credential system could not authenticate' };
        }
        // For other errors (network, etc.), assume credentials might work
        return { success: false, error: errorMsg };
      }
    }

    // Fallback to child_process - try git ls-remote without credentials
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    // Convert SSH URL to HTTPS if needed
    let testUrl = remoteUrl;
    if (testUrl.startsWith('git@') || testUrl.startsWith('ssh://')) {
      // For SSH, Git will use SSH keys automatically
      testUrl = testUrl;
    }

    try {
      // Try git ls-remote without explicit credentials
      // Git will use credential helper, SSH keys, or prompt
      await execAsync(`git ls-remote "${testUrl}"`, {
        cwd: currentRepoPath,
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      });
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
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

