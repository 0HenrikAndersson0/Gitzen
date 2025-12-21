import { GitCommands } from './GitCommands';
import { CredentialManager } from './CredentialManager';
import * as path from 'path';
import * as fs from 'fs';

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

    // Create URL with credentials
    const urlObj = new URL(testUrl);
    urlObj.username = username;
    urlObj.password = password;
    const urlWithCreds = urlObj.toString();

    // Test credentials by attempting to list remote refs
    try {
      await execAsync(`git ls-remote ${urlWithCreds}`, {
        timeout: 10000, // 10 second timeout
        maxBuffer: 1024 * 1024, // 1MB
      });
      return { success: true };
    } catch (error: any) {
      const errorMsg = error.message || '';
      if (errorMsg.includes('Authentication failed') || 
          errorMsg.includes('fatal: could not read Username') ||
          errorMsg.includes('fatal: could not read Password') ||
          errorMsg.includes('Permission denied') ||
          errorMsg.includes('401') ||
          errorMsg.includes('403')) {
        return { success: false, error: 'Authentication failed: Invalid username or password' };
      }
      return { success: false, error: `Failed to validate credentials: ${errorMsg}` };
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

