import * as keytar from 'keytar';

/**
 * Service name for storing Git credentials in the OS keychain
 */
const SERVICE_NAME = 'git-gui';

/**
 * Interface for stored Git credentials
 */
export interface StoredCredentials {
  username?: string;
  password?: string;
  privateKey?: string;
  publicKey?: string;
  passphrase?: string;
}

/**
 * CredentialManager provides secure storage for Git credentials using the OS keychain.
 * 
 * Uses keytar which leverages:
 * - macOS: Keychain
 * - Windows: Credential Vault
 * - Linux: libsecret (GNOME Keyring, KDE Wallet, etc.)
 */
export class CredentialManager {
  private serviceName: string;

  /**
   * Creates a new CredentialManager instance
   * @param serviceName - Optional service name for keychain entries (default: 'git-gui')
   */
  constructor(serviceName: string = SERVICE_NAME) {
    this.serviceName = serviceName;
  }

  /**
   * Stores credentials for a specific remote URL or repository
   * @param identifier - Unique identifier (e.g., remote URL, repository path, or account name)
   * @param credentials - Credentials to store
   * @returns Promise<void>
   */
  async storeCredentials(identifier: string, credentials: StoredCredentials): Promise<void> {
    try {
      // Store username/password if provided
      if (credentials.username && credentials.password) {
        const account = `${identifier}:username`;
        await keytar.setPassword(this.serviceName, account, credentials.username);
        
        const passwordAccount = `${identifier}:password`;
        await keytar.setPassword(this.serviceName, passwordAccount, credentials.password);
      }

      // Store SSH keys if provided
      if (credentials.privateKey) {
        const privateKeyAccount = `${identifier}:privateKey`;
        await keytar.setPassword(this.serviceName, privateKeyAccount, credentials.privateKey);
      }

      if (credentials.publicKey) {
        const publicKeyAccount = `${identifier}:publicKey`;
        await keytar.setPassword(this.serviceName, publicKeyAccount, credentials.publicKey);
      }

      // Store passphrase if provided
      if (credentials.passphrase) {
        const passphraseAccount = `${identifier}:passphrase`;
        await keytar.setPassword(this.serviceName, passphraseAccount, credentials.passphrase);
      }

      // Store a metadata entry to track what credentials exist for this identifier
      const metadata = {
        hasUsername: !!credentials.username,
        hasPassword: !!credentials.password,
        hasPrivateKey: !!credentials.privateKey,
        hasPublicKey: !!credentials.publicKey,
        hasPassphrase: !!credentials.passphrase,
      };
      const metadataAccount = `${identifier}:metadata`;
      await keytar.setPassword(this.serviceName, metadataAccount, JSON.stringify(metadata));
    } catch (error) {
      throw new Error(`Failed to store credentials: ${error}`);
    }
  }

  /**
   * Retrieves stored credentials for a specific identifier
   * @param identifier - Unique identifier used when storing
   * @returns Promise<StoredCredentials | null>
   */
  async getCredentials(identifier: string): Promise<StoredCredentials | null> {
    try {
      // Check if credentials exist
      const metadataAccount = `${identifier}:metadata`;
      const metadataStr = await keytar.getPassword(this.serviceName, metadataAccount);
      
      if (!metadataStr) {
        return null;
      }

      const metadata = JSON.parse(metadataStr);
      const credentials: StoredCredentials = {};

      // Retrieve username/password if they exist
      if (metadata.hasUsername) {
        const usernameAccount = `${identifier}:username`;
        credentials.username = await keytar.getPassword(this.serviceName, usernameAccount) || undefined;
      }

      if (metadata.hasPassword) {
        const passwordAccount = `${identifier}:password`;
        credentials.password = await keytar.getPassword(this.serviceName, passwordAccount) || undefined;
      }

      // Retrieve SSH keys if they exist
      if (metadata.hasPrivateKey) {
        const privateKeyAccount = `${identifier}:privateKey`;
        credentials.privateKey = await keytar.getPassword(this.serviceName, privateKeyAccount) || undefined;
      }

      if (metadata.hasPublicKey) {
        const publicKeyAccount = `${identifier}:publicKey`;
        credentials.publicKey = await keytar.getPassword(this.serviceName, publicKeyAccount) || undefined;
      }

      // Retrieve passphrase if it exists
      if (metadata.hasPassphrase) {
        const passphraseAccount = `${identifier}:passphrase`;
        credentials.passphrase = await keytar.getPassword(this.serviceName, passphraseAccount) || undefined;
      }

      return credentials;
    } catch (error) {
      throw new Error(`Failed to retrieve credentials: ${error}`);
    }
  }

  /**
   * Deletes stored credentials for a specific identifier
   * @param identifier - Unique identifier used when storing
   * @returns Promise<boolean> - True if credentials were deleted, false if they didn't exist
   */
  async deleteCredentials(identifier: string): Promise<boolean> {
    try {
      const metadataAccount = `${identifier}:metadata`;
      const metadataStr = await keytar.getPassword(this.serviceName, metadataAccount);
      
      if (!metadataStr) {
        return false;
      }

      const metadata = JSON.parse(metadataStr);
      let deleted = false;

      // Delete all stored entries
      if (metadata.hasUsername) {
        const usernameAccount = `${identifier}:username`;
        await keytar.deletePassword(this.serviceName, usernameAccount);
        deleted = true;
      }

      if (metadata.hasPassword) {
        const passwordAccount = `${identifier}:password`;
        await keytar.deletePassword(this.serviceName, passwordAccount);
        deleted = true;
      }

      if (metadata.hasPrivateKey) {
        const privateKeyAccount = `${identifier}:privateKey`;
        await keytar.deletePassword(this.serviceName, privateKeyAccount);
        deleted = true;
      }

      if (metadata.hasPublicKey) {
        const publicKeyAccount = `${identifier}:publicKey`;
        await keytar.deletePassword(this.serviceName, publicKeyAccount);
        deleted = true;
      }

      if (metadata.hasPassphrase) {
        const passphraseAccount = `${identifier}:passphrase`;
        await keytar.deletePassword(this.serviceName, passphraseAccount);
        deleted = true;
      }

      // Delete metadata
      await keytar.deletePassword(this.serviceName, metadataAccount);

      return deleted;
    } catch (error) {
      throw new Error(`Failed to delete credentials: ${error}`);
    }
  }

  /**
   * Lists all stored credential identifiers
   * @returns Promise<string[]> - Array of unique identifiers
   */
  async listCredentials(): Promise<string[]> {
    try {
      const credentials = await keytar.findCredentials(this.serviceName);
      const identifiers = new Set<string>();

      credentials.forEach(cred => {
        // Extract identifier from account name (format: "identifier:type")
        const match = cred.account.match(/^(.+):(username|password|privateKey|publicKey|passphrase|metadata)$/);
        if (match) {
          identifiers.add(match[1]);
        }
      });

      return Array.from(identifiers);
    } catch (error) {
      throw new Error(`Failed to list credentials: ${error}`);
    }
  }

  /**
   * Checks if credentials exist for a specific identifier
   * @param identifier - Unique identifier to check
   * @returns Promise<boolean>
   */
  async hasCredentials(identifier: string): Promise<boolean> {
    try {
      const metadataAccount = `${identifier}:metadata`;
      const metadata = await keytar.getPassword(this.serviceName, metadataAccount);
      return metadata !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Stores credentials for a remote URL (normalizes the URL for consistent storage)
   * @param remoteUrl - Git remote URL
   * @param credentials - Credentials to store
   * @returns Promise<void>
   */
  async storeRemoteCredentials(remoteUrl: string, credentials: StoredCredentials): Promise<void> {
    const normalizedUrl = this.normalizeRemoteUrl(remoteUrl);
    return this.storeCredentials(normalizedUrl, credentials);
  }

  /**
   * Retrieves credentials for a remote URL
   * @param remoteUrl - Git remote URL
   * @returns Promise<StoredCredentials | null>
   */
  async getRemoteCredentials(remoteUrl: string): Promise<StoredCredentials | null> {
    const normalizedUrl = this.normalizeRemoteUrl(remoteUrl);
    return this.getCredentials(normalizedUrl);
  }

  /**
   * Deletes credentials for a remote URL
   * @param remoteUrl - Git remote URL
   * @returns Promise<boolean>
   */
  async deleteRemoteCredentials(remoteUrl: string): Promise<boolean> {
    const normalizedUrl = this.normalizeRemoteUrl(remoteUrl);
    return this.deleteCredentials(normalizedUrl);
  }

  /**
   * Normalizes a remote URL for consistent storage
   * Removes protocol, trailing slashes, and normalizes format
   * @param remoteUrl - Git remote URL
   * @returns string - Normalized identifier
   */
  private normalizeRemoteUrl(remoteUrl: string): string {
    // Remove protocol
    let normalized = remoteUrl.replace(/^https?:\/\//, '').replace(/^git@/, '');
    
    // Remove trailing .git
    normalized = normalized.replace(/\.git$/, '');
    
    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '');
    
    // Replace common variations
    normalized = normalized.replace(/github\.com:/, 'github.com/');
    
    return normalized;
  }

  /**
   * Stores credentials for a repository path
   * @param repoPath - Path to the repository
   * @param credentials - Credentials to store
   * @returns Promise<void>
   */
  async storeRepositoryCredentials(repoPath: string, credentials: StoredCredentials): Promise<void> {
    const normalizedPath = this.normalizePath(repoPath);
    return this.storeCredentials(normalizedPath, credentials);
  }

  /**
   * Retrieves credentials for a repository path
   * @param repoPath - Path to the repository
   * @returns Promise<StoredCredentials | null>
   */
  async getRepositoryCredentials(repoPath: string): Promise<StoredCredentials | null> {
    const normalizedPath = this.normalizePath(repoPath);
    return this.getCredentials(normalizedPath);
  }

  /**
   * Deletes credentials for a repository path
   * @param repoPath - Path to the repository
   * @returns Promise<boolean>
   */
  async deleteRepositoryCredentials(repoPath: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(repoPath);
    return this.deleteCredentials(normalizedPath);
  }

  /**
   * Normalizes a file path for consistent storage
   * @param repoPath - Repository path
   * @returns string - Normalized path
   */
  private normalizePath(repoPath: string): string {
    // Convert to absolute path and normalize
    const path = require('path');
    return path.resolve(repoPath);
  }
}
