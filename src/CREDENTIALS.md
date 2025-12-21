# Secure Credential Storage

The `CredentialManager` class provides secure storage for Git credentials using the OS keychain. This ensures that passwords, tokens, and SSH keys are never stored in plain text.

## Security Features

- **OS Keychain Integration**: Uses the native OS credential storage
  - **macOS**: Keychain
  - **Windows**: Credential Vault
  - **Linux**: libsecret (GNOME Keyring, KDE Wallet, etc.)
- **Automatic Retrieval**: GitCommands can automatically retrieve stored credentials
- **Multiple Storage Options**: Store by remote URL or repository path
- **SSH Key Support**: Store private keys, public keys, and passphrases securely

## Installation

The `keytar` package is already installed. For Electron apps, you may need to rebuild native modules:

```bash
npm rebuild keytar
```

## Basic Usage

### Initialize Credential Manager

```typescript
import { CredentialManager } from './CredentialManager';

const credentialManager = new CredentialManager();
```

### Store HTTPS Credentials

```typescript
// Store credentials for a remote URL
await credentialManager.storeRemoteCredentials('https://github.com/user/repo.git', {
  username: 'your-username',
  password: 'ghp_yourPersonalAccessToken'
});
```

### Store SSH Credentials

```typescript
import * as fs from 'fs';

const privateKey = fs.readFileSync('/home/user/.ssh/id_rsa', 'utf8');
const publicKey = fs.readFileSync('/home/user/.ssh/id_rsa.pub', 'utf8');

await credentialManager.storeRemoteCredentials('git@github.com:user/repo.git', {
  privateKey: privateKey,
  publicKey: publicKey,
  passphrase: 'optional-passphrase' // Only if your key has a passphrase
});
```

### Retrieve Credentials

```typescript
const credentials = await credentialManager.getRemoteCredentials('https://github.com/user/repo.git');
if (credentials) {
  console.log(`Username: ${credentials.username}`);
  // Password is securely stored and retrieved
}
```

### Delete Credentials

```typescript
const deleted = await credentialManager.deleteRemoteCredentials('https://github.com/user/repo.git');
if (deleted) {
  console.log('Credentials deleted successfully');
}
```

## Integration with GitCommands

### Automatic Credential Retrieval

When you provide a `CredentialManager` to `GitCommands`, it will automatically retrieve stored credentials for remote operations:

```typescript
import { GitCommands } from './GitCommands';
import { CredentialManager } from './CredentialManager';

// Initialize credential manager
const credentialManager = new CredentialManager();

// Store credentials
await credentialManager.storeRemoteCredentials('https://github.com/user/repo.git', {
  username: 'your-username',
  password: 'your-token'
});

// Create GitCommands with credential manager
const git = new GitCommands('/path/to/repo', credentialManager);
await git.openRepository();

// Push without providing credentials - will use stored credentials automatically
await git.push('origin', 'main');

// Pull without providing credentials
await git.pull('origin', 'main');

// Clone without providing credentials
await git.clone({
  url: 'https://github.com/user/repo.git',
  localPath: '/tmp/cloned-repo'
  // No credentials needed - retrieved automatically
});
```

### Manual Credential Override

You can still provide credentials directly, which will take precedence over stored credentials:

```typescript
// This will use the provided credentials, not stored ones
await git.push('origin', 'main', {
  username: 'different-user',
  password: 'different-token'
});
```

## Storage Methods

### By Remote URL

Store credentials associated with a remote URL:

```typescript
await credentialManager.storeRemoteCredentials('https://github.com/user/repo.git', {
  username: 'user',
  password: 'token'
});

const creds = await credentialManager.getRemoteCredentials('https://github.com/user/repo.git');
```

The URL is normalized automatically, so these are equivalent:
- `https://github.com/user/repo.git`
- `https://github.com/user/repo`
- `github.com/user/repo`

### By Repository Path

Store credentials for a specific repository:

```typescript
await credentialManager.storeRepositoryCredentials('/path/to/repo', {
  username: 'user',
  password: 'token'
});

const creds = await credentialManager.getRepositoryCredentials('/path/to/repo');
```

### By Custom Identifier

Store credentials with a custom identifier:

```typescript
await credentialManager.storeCredentials('my-custom-id', {
  username: 'user',
  password: 'token'
});

const creds = await credentialManager.getCredentials('my-custom-id');
```

## Managing Stored Credentials

### List All Credentials

```typescript
const identifiers = await credentialManager.listCredentials();
console.log('Stored credentials:', identifiers);
```

### Check if Credentials Exist

```typescript
const exists = await credentialManager.hasCredentials('https://github.com/user/repo.git');
if (exists) {
  console.log('Credentials are stored');
}
```

## API Reference

### CredentialManager Class

#### Constructor

```typescript
new CredentialManager(serviceName?: string)
```

Creates a new CredentialManager instance. Optional `serviceName` defaults to `'git-gui'`.

#### Methods

##### `storeCredentials(identifier: string, credentials: StoredCredentials): Promise<void>`

Stores credentials for a custom identifier.

##### `getCredentials(identifier: string): Promise<StoredCredentials | null>`

Retrieves credentials for a custom identifier.

##### `deleteCredentials(identifier: string): Promise<boolean>`

Deletes credentials for a custom identifier. Returns `true` if credentials were deleted.

##### `listCredentials(): Promise<string[]>`

Returns an array of all stored credential identifiers.

##### `hasCredentials(identifier: string): Promise<boolean>`

Checks if credentials exist for an identifier.

##### `storeRemoteCredentials(remoteUrl: string, credentials: StoredCredentials): Promise<void>`

Stores credentials for a remote URL (normalizes the URL automatically).

##### `getRemoteCredentials(remoteUrl: string): Promise<StoredCredentials | null>`

Retrieves credentials for a remote URL.

##### `deleteRemoteCredentials(remoteUrl: string): Promise<boolean>`

Deletes credentials for a remote URL.

##### `storeRepositoryCredentials(repoPath: string, credentials: StoredCredentials): Promise<void>`

Stores credentials for a repository path.

##### `getRepositoryCredentials(repoPath: string): Promise<StoredCredentials | null>`

Retrieves credentials for a repository path.

##### `deleteRepositoryCredentials(repoPath: string): Promise<boolean>`

Deletes credentials for a repository path.

## StoredCredentials Interface

```typescript
interface StoredCredentials {
  username?: string;
  password?: string;
  privateKey?: string;
  publicKey?: string;
  passphrase?: string;
}
```

## Best Practices

1. **Use Personal Access Tokens**: For GitHub/GitLab, use personal access tokens instead of passwords
2. **Store Once, Use Everywhere**: Store credentials once and let GitCommands retrieve them automatically
3. **Repository-Specific Credentials**: Use repository-specific storage for different credentials per repo
4. **Clean Up**: Delete credentials when no longer needed
5. **Error Handling**: Always wrap credential operations in try-catch blocks

## Example: Complete Workflow

```typescript
import { GitCommands } from './GitCommands';
import { CredentialManager } from './CredentialManager';

async function workflow() {
  // Initialize
  const credentialManager = new CredentialManager();
  const git = new GitCommands('/path/to/repo', credentialManager);

  // Store credentials (only needed once)
  await credentialManager.storeRemoteCredentials('https://github.com/user/repo.git', {
    username: 'user',
    password: 'ghp_token'
  });

  // Open repository
  await git.openRepository();

  // All operations use stored credentials automatically
  await git.pull('origin', 'main');
  await git.createBranch('feature/new-feature', true);
  await git.stageAll();
  await git.commit({ message: 'feat: Add new feature' });
  await git.push('origin', 'feature/new-feature');

  // Clean up when done (optional)
  // await credentialManager.deleteRemoteCredentials('https://github.com/user/repo.git');
}
```

## Troubleshooting

### Linux: Keyring Not Available

If you get errors on Linux, you may need to install libsecret:

```bash
# Ubuntu/Debian
sudo apt-get install libsecret-1-dev

# Fedora/RHEL
sudo dnf install libsecret-devel

# Arch Linux
sudo pacman -S libsecret
```

### Electron: Native Module Issues

If you encounter native module issues in Electron, rebuild keytar:

```bash
npm rebuild keytar
```

Or use electron-rebuild:

```bash
npm install --save-dev electron-rebuild
npx electron-rebuild
```

## Security Notes

- Credentials are stored in the OS keychain, which is encrypted
- Never log or display credentials in plain text
- Use environment variables for CI/CD pipelines instead
- Regularly rotate tokens and keys
- Use SSH keys with passphrases for additional security
