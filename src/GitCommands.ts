import * as Git from 'nodegit';
import * as path from 'path';
import { CredentialManager, StoredCredentials } from './CredentialManager';

/**
 * Interface for Git credentials
 */
export interface GitCredentials {
  username?: string;
  password?: string;
  privateKey?: string;
  publicKey?: string;
  passphrase?: string;
}

/**
 * Interface for commit options
 */
export interface CommitOptions {
  message: string;
  author?: {
    name: string;
    email: string;
  };
}

/**
 * Interface for clone options
 */
export interface CloneOptions {
  url: string;
  localPath: string;
  credentials?: GitCredentials;
}

/**
 * GitCommands class provides a high-level interface for common Git operations
 * using libgit2 through nodegit bindings.
 */
export class GitCommands {
  private repo: Git.Repository | null = null;
  private repoPath: string;
  private credentialManager: CredentialManager | null = null;

  /**
   * Creates a new GitCommands instance
   * @param repoPath - Path to the Git repository
   * @param credentialManager - Optional credential manager for secure credential storage
   */
  constructor(repoPath: string, credentialManager?: CredentialManager) {
    this.repoPath = repoPath;
    this.credentialManager = credentialManager || null;
  }

  /**
   * Sets the credential manager for this instance
   * @param credentialManager - Credential manager instance
   */
  setCredentialManager(credentialManager: CredentialManager): void {
    this.credentialManager = credentialManager;
  }

  /**
   * Gets the credential manager instance
   * @returns CredentialManager | null
   */
  getCredentialManager(): CredentialManager | null {
    return this.credentialManager;
  }

  /**
   * Helper method to get credentials from credential manager or use provided credentials
   * @param remoteUrl - Remote URL to look up credentials for
   * @param providedCredentials - Optional credentials provided directly
   * @returns Promise<GitCredentials | undefined>
   */
  private async getCredentialsForRemote(
    remoteUrl: string,
    providedCredentials?: GitCredentials
  ): Promise<GitCredentials | undefined> {
    // If credentials are provided directly, use them
    if (providedCredentials) {
      return providedCredentials;
    }

    // Try to get from credential manager
    if (this.credentialManager) {
      const stored = await this.credentialManager.getRemoteCredentials(remoteUrl);
      if (stored) {
        return stored as GitCredentials;
      }
    }

    return undefined;
  }

  /**
   * Gets the remote URL for a given remote name
   * @param remoteName - Name of the remote (default: 'origin')
   * @returns Promise<string>
   */
  async getRemoteUrl(remoteName: string = 'origin'): Promise<string> {
    try {
      if (!this.repo) {
        await this.openRepository();
      }

      const remote = await this.repo!.getRemote(remoteName);
      return remote.url();
    } catch (error) {
      throw new Error(`Failed to get remote URL: ${error}`);
    }
  }

  /**
   * Opens an existing repository
   * @returns Promise<Git.Repository>
   */
  async openRepository(): Promise<Git.Repository> {
    try {
      this.repo = await Git.Repository.open(this.repoPath);
      return this.repo;
    } catch (error) {
      throw new Error(`Failed to open repository: ${error}`);
    }
  }

  /**
   * Clones a repository from a remote URL
   * @param options - Clone options including URL, local path, and credentials
   * @returns Promise<Git.Repository>
   */
  async clone(options: CloneOptions): Promise<Git.Repository> {
    try {
      const cloneOptions: Git.CloneOptions = {};

      // Get credentials from credential manager or use provided
      const credentials = await this.getCredentialsForRemote(
        options.url,
        options.credentials
      );

      // Setup credentials if available
      if (credentials) {
        cloneOptions.fetchOpts = {
          callbacks: {
            credentials: (url: string, userName: string) => {
              if (credentials.privateKey && credentials.publicKey) {
                return Git.Cred.sshKeyNew(
                  userName,
                  credentials.publicKey,
                  credentials.privateKey,
                  credentials.passphrase || ''
                );
              } else if (credentials.username && credentials.password) {
                return Git.Cred.userpassPlaintextNew(
                  credentials.username,
                  credentials.password
                );
              }
              return Git.Cred.defaultNew();
            }
          }
        };
      }

      this.repo = await Git.Clone(options.url, options.localPath, cloneOptions);
      this.repoPath = options.localPath;
      return this.repo!;
    } catch (error) {
      throw new Error(`Failed to clone repository: ${error}`);
    }
  }

  /**
   * Creates a new branch
   * @param branchName - Name of the new branch
   * @param checkout - Whether to checkout the new branch immediately (default: true)
   * @returns Promise<Git.Reference>
   */
  async createBranch(branchName: string, checkout: boolean = true): Promise<Git.Reference> {
    try {
      if (!this.repo) {
        await this.openRepository();
      }

      const head = await this.repo!.getHeadCommit();
      const branch = await this.repo!.createBranch(branchName, head, false);

      if (checkout) {
        await this.checkoutBranch(branchName);
      }

      return branch;
    } catch (error) {
      throw new Error(`Failed to create branch: ${error}`);
    }
  }

  /**
   * Checks out an existing branch
   * @param branchName - Name of the branch to checkout
   * @returns Promise<void>
   */
  async checkoutBranch(branchName: string): Promise<void> {
    try {
      if (!this.repo) {
        await this.openRepository();
      }

      await this.repo!.checkoutBranch(branchName);
    } catch (error) {
      throw new Error(`Failed to checkout branch: ${error}`);
    }
  }

  /**
   * Gets the current branch name
   * @returns Promise<string>
   */
  async getCurrentBranch(): Promise<string> {
    try {
      if (!this.repo) {
        await this.openRepository();
      }

      const head = await this.repo!.head();
      return head.shorthand();
    } catch (error) {
      throw new Error(`Failed to get current branch: ${error}`);
    }
  }

  /**
   * Lists all branches in the repository
   * @returns Promise<string[]>
   */
  async listBranches(): Promise<string[]> {
    try {
      if (!this.repo) {
        await this.openRepository();
      }

      const references = await this.repo!.getReferences();
      const branches = references
        .filter((ref: Git.Reference) => ref.isBranch())
        .map((ref: Git.Reference) => ref.shorthand());

      return branches;
    } catch (error) {
      throw new Error(`Failed to list branches: ${error}`);
    }
  }

  /**
   * Stages all changes in the working directory
   * @returns Promise<void>
   */
  async stageAll(): Promise<void> {
    try {
      if (!this.repo) {
        await this.openRepository();
      }

      const index = await this.repo!.refreshIndex();
      await index.addAll();
      await index.write();
    } catch (error) {
      throw new Error(`Failed to stage changes: ${error}`);
    }
  }

  /**
   * Stages specific files
   * @param files - Array of file paths to stage
   * @returns Promise<void>
   */
  async stageFiles(files: string[]): Promise<void> {
    try {
      if (!this.repo) {
        await this.openRepository();
      }

      const index = await this.repo!.refreshIndex();
      for (const file of files) {
        await index.addByPath(file);
      }
      await index.write();
    } catch (error) {
      throw new Error(`Failed to stage files: ${error}`);
    }
  }

  /**
   * Creates a commit with staged changes
   * @param options - Commit options including message and author
   * @returns Promise<Git.Oid> - The OID of the created commit
   */
  async commit(options: CommitOptions): Promise<Git.Oid> {
    try {
      if (!this.repo) {
        await this.openRepository();
      }

      const index = await this.repo!.refreshIndex();
      const oid = await index.writeTree();
      const head = await this.repo!.getHeadCommit();

      // Get author and committer
      let author: Git.Signature;
      let committer: Git.Signature;

      if (options.author) {
        author = Git.Signature.now(options.author.name, options.author.email);
        committer = Git.Signature.now(options.author.name, options.author.email);
      } else {
        // Use default signature from git config
        author = await Git.Signature.default(this.repo!);
        committer = await Git.Signature.default(this.repo!);
      }

      const commitId = await this.repo!.createCommit(
        'HEAD',
        author,
        committer,
        options.message,
        oid,
        [head]
      );

      return commitId;
    } catch (error) {
      throw new Error(`Failed to commit: ${error}`);
    }
  }

  /**
   * Pushes changes to a remote repository
   * @param remoteName - Name of the remote (default: 'origin')
   * @param branchName - Name of the branch to push (default: current branch)
   * @param credentials - Optional credentials for authentication (will use credential manager if not provided)
   * @returns Promise<void>
   */
  async push(
    remoteName: string = 'origin',
    branchName?: string,
    credentials?: GitCredentials
  ): Promise<void> {
    try {
      if (!this.repo) {
        await this.openRepository();
      }

      const remote = await this.repo!.getRemote(remoteName);
      const remoteUrl = remote.url();
      
      // Get credentials from credential manager or use provided
      const creds = await this.getCredentialsForRemote(remoteUrl, credentials);
      
      // Get current branch if not specified
      if (!branchName) {
        const head = await this.repo!.head();
        branchName = head.shorthand();
      }

      const refSpec = `refs/heads/${branchName}:refs/heads/${branchName}`;

      const pushOptions: Git.PushOptions = {
        callbacks: {
          credentials: (url: string, userName: string) => {
            if (creds?.privateKey && creds?.publicKey) {
              return Git.Cred.sshKeyNew(
                userName,
                creds.publicKey,
                creds.privateKey,
                creds.passphrase || ''
              );
            } else if (creds?.username && creds?.password) {
              return Git.Cred.userpassPlaintextNew(
                creds.username,
                creds.password
              );
            }
            return Git.Cred.defaultNew();
          }
        }
      };

      await remote.push([refSpec], pushOptions);
    } catch (error) {
      throw new Error(`Failed to push: ${error}`);
    }
  }

  /**
   * Pulls changes from a remote repository
   * @param remoteName - Name of the remote (default: 'origin')
   * @param branchName - Name of the branch to pull (default: current branch)
   * @param credentials - Optional credentials for authentication (will use credential manager if not provided)
   * @returns Promise<void>
   */
  async pull(
    remoteName: string = 'origin',
    branchName?: string,
    credentials?: GitCredentials
  ): Promise<void> {
    try {
      if (!this.repo) {
        await this.openRepository();
      }

      // Fetch first
      await this.fetch(remoteName, credentials);

      // Get current branch if not specified
      if (!branchName) {
        const head = await this.repo!.head();
        branchName = head.shorthand();
      }

      // Merge
      await this.repo!.mergeBranches(
        branchName,
        `${remoteName}/${branchName}`
      );
    } catch (error) {
      throw new Error(`Failed to pull: ${error}`);
    }
  }

  /**
   * Fetches changes from a remote repository
   * @param remoteName - Name of the remote (default: 'origin')
   * @param credentials - Optional credentials for authentication (will use credential manager if not provided)
   * @returns Promise<void>
   */
  async fetch(remoteName: string = 'origin', credentials?: GitCredentials): Promise<void> {
    try {
      if (!this.repo) {
        await this.openRepository();
      }

      const remote = await this.repo!.getRemote(remoteName);
      const remoteUrl = remote.url();

      // Get credentials from credential manager or use provided
      const creds = await this.getCredentialsForRemote(remoteUrl, credentials);

      const fetchOptions: Git.FetchOptions = {
        callbacks: {
          credentials: (url: string, userName: string) => {
            if (creds?.privateKey && creds?.publicKey) {
              return Git.Cred.sshKeyNew(
                userName,
                creds.publicKey,
                creds.privateKey,
                creds.passphrase || ''
              );
            } else if (creds?.username && creds?.password) {
              return Git.Cred.userpassPlaintextNew(
                creds.username,
                creds.password
              );
            }
            return Git.Cred.defaultNew();
          }
        }
      };

      await remote.fetch([], fetchOptions, 'Fetching');
    } catch (error) {
      throw new Error(`Failed to fetch: ${error}`);
    }
  }

  /**
   * Gets the status of the working directory
   * @returns Promise<Git.StatusFile[]>
   */
  async getStatus(): Promise<Git.StatusFile[]> {
    try {
      if (!this.repo) {
        await this.openRepository();
      }

      const statuses = await this.repo!.getStatus();
      return statuses;
    } catch (error) {
      throw new Error(`Failed to get status: ${error}`);
    }
  }

  /**
   * Gets the commit history
   * @param maxCount - Maximum number of commits to retrieve (default: 100)
   * @returns Promise<Git.Commit[]>
   */
  async getHistory(maxCount: number = 100): Promise<Git.Commit[]> {
    try {
      if (!this.repo) {
        await this.openRepository();
      }

      const firstCommit = await this.repo!.getHeadCommit();
      const history = await firstCommit.history();
      
      return new Promise((resolve, reject) => {
        const commits: Git.Commit[] = [];
        
        history.on('commit', (commit: Git.Commit) => {
          commits.push(commit);
          if (commits.length >= maxCount) {
            history.removeAllListeners();
            resolve(commits);
          }
        });

        history.on('end', () => {
          resolve(commits);
        });

        history.on('error', (error: Error) => {
          reject(error);
        });

        history.start();
      });
    } catch (error) {
      throw new Error(`Failed to get history: ${error}`);
    }
  }

  /**
   * Gets the repository instance
   * @returns Git.Repository | null
   */
  getRepository(): Git.Repository | null {
    return this.repo;
  }

  /**
   * Gets the repository path
   * @returns string
   */
  getRepositoryPath(): string {
    return this.repoPath;
  }
}
