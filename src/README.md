# GitCommands Class

A TypeScript wrapper around libgit2 (via nodegit) providing a clean, promise-based API for common Git operations.

## Features

- **Clone repositories** - Clone from remote URLs with credential support
- **Branch management** - Create, checkout, and list branches
- **Commit operations** - Stage files and create commits
- **Remote operations** - Push, pull, and fetch from remote repositories
- **Status tracking** - Get working directory status and commit history
- **Secure credential storage** - OS keychain integration via CredentialManager
- **Automatic credential retrieval** - GitCommands automatically uses stored credentials
- **Full TypeScript support** - Complete type definitions for all operations

## Installation

The required dependencies are already installed:

```bash
npm install nodegit typescript @types/node
```

## Building

Compile the TypeScript code:

```bash
npm run compile
```

Watch mode for development:

```bash
npm run compile:watch
```

## Usage

### Basic Example

```typescript
import { GitCommands } from './GitCommands';

async function main() {
  // Open an existing repository
  const git = new GitCommands('/path/to/your/repo');
  await git.openRepository();

  // Get current branch
  const branch = await git.getCurrentBranch();
  console.log(`Current branch: ${branch}`);

  // Stage all changes
  await git.stageAll();

  // Commit
  await git.commit({
    message: 'feat: Add new feature',
    author: {
      name: 'Your Name',
      email: 'your.email@example.com'
    }
  });

  // Push to remote
  await git.push('origin', 'main');
}
```

### Clone a Repository

```typescript
const git = new GitCommands('/tmp/my-repo');

// Clone with HTTPS
await git.clone({
  url: 'https://github.com/user/repo.git',
  localPath: '/tmp/my-repo',
  credentials: {
    username: 'your-username',
    password: 'your-token'
  }
});

// Clone with SSH
await git.clone({
  url: 'git@github.com:user/repo.git',
  localPath: '/tmp/my-repo',
  credentials: {
    publicKey: '/home/user/.ssh/id_rsa.pub',
    privateKey: '/home/user/.ssh/id_rsa',
    passphrase: 'optional-passphrase'
  }
});
```

### Branch Operations

```typescript
// Create a new branch and checkout
await git.createBranch('feature/new-feature', true);

// Create without checkout
await git.createBranch('feature/another-feature', false);

// Checkout existing branch
await git.checkoutBranch('main');

// List all branches
const branches = await git.listBranches();
console.log('Branches:', branches);

// Get current branch
const current = await git.getCurrentBranch();
console.log('Current:', current);
```

### Staging and Committing

```typescript
// Stage all changes
await git.stageAll();

// Stage specific files
await git.stageFiles(['src/file1.ts', 'src/file2.ts']);

// Commit with custom author
await git.commit({
  message: 'fix: Resolve bug in authentication',
  author: {
    name: 'John Doe',
    email: 'john@example.com'
  }
});

// Commit with default author (from git config)
await git.commit({
  message: 'docs: Update README'
});
```

### Remote Operations

```typescript
// Push to remote
await git.push('origin', 'main', {
  username: 'your-username',
  password: 'your-token'
});

// Pull from remote
await git.pull('origin', 'main', {
  username: 'your-username',
  password: 'your-token'
});

// Fetch without merging
await git.fetch('origin', {
  username: 'your-username',
  password: 'your-token'
});
```

### Repository Status

```typescript
// Get working directory status
const status = await git.getStatus();
status.forEach(file => {
  console.log(`${file.path()} - Status: ${file.statusBit()}`);
});

// Get commit history
const commits = await git.getHistory(10);
commits.forEach(commit => {
  console.log(`${commit.sha().substring(0, 7)} - ${commit.message()}`);
  console.log(`Author: ${commit.author().name()}`);
  console.log(`Date: ${commit.date()}`);
});
```

## API Reference

### Constructor

```typescript
new GitCommands(repoPath: string)
```

Creates a new GitCommands instance for the specified repository path.

### Methods

#### `openRepository(): Promise<Git.Repository>`
Opens an existing repository at the path specified in the constructor.

#### `clone(options: CloneOptions): Promise<Git.Repository>`
Clones a repository from a remote URL.

**CloneOptions:**
- `url: string` - Remote repository URL
- `localPath: string` - Local path to clone to
- `credentials?: GitCredentials` - Optional authentication credentials

#### `createBranch(branchName: string, checkout?: boolean): Promise<Git.Reference>`
Creates a new branch. If `checkout` is true (default), switches to the new branch.

#### `checkoutBranch(branchName: string): Promise<void>`
Checks out an existing branch.

#### `getCurrentBranch(): Promise<string>`
Returns the name of the current branch.

#### `listBranches(): Promise<string[]>`
Returns an array of all branch names in the repository.

#### `stageAll(): Promise<void>`
Stages all changes in the working directory.

#### `stageFiles(files: string[]): Promise<void>`
Stages specific files.

#### `commit(options: CommitOptions): Promise<Git.Oid>`
Creates a commit with staged changes.

**CommitOptions:**
- `message: string` - Commit message
- `author?: { name: string, email: string }` - Optional author info

#### `push(remoteName?: string, branchName?: string, credentials?: GitCredentials): Promise<void>`
Pushes changes to a remote repository. Defaults to 'origin' and current branch.

#### `pull(remoteName?: string, branchName?: string, credentials?: GitCredentials): Promise<void>`
Pulls changes from a remote repository. Defaults to 'origin' and current branch.

#### `fetch(remoteName?: string, credentials?: GitCredentials): Promise<void>`
Fetches changes from a remote without merging. Defaults to 'origin'.

#### `getStatus(): Promise<Git.StatusFile[]>`
Returns the status of files in the working directory.

#### `getHistory(maxCount?: number): Promise<Git.Commit[]>`
Returns commit history. Default limit is 100 commits.

#### `getRepository(): Git.Repository | null`
Returns the underlying nodegit Repository instance.

#### `getRepositoryPath(): string`
Returns the repository path.

## Types

### GitCredentials

```typescript
interface GitCredentials {
  username?: string;
  password?: string;
  privateKey?: string;
  publicKey?: string;
  passphrase?: string;
}
```

### CommitOptions

```typescript
interface CommitOptions {
  message: string;
  author?: {
    name: string;
    email: string;
  };
}
```

### CloneOptions

```typescript
interface CloneOptions {
  url: string;
  localPath: string;
  credentials?: GitCredentials;
}
```

## Error Handling

All methods throw errors with descriptive messages. Always wrap calls in try-catch blocks:

```typescript
try {
  await git.push('origin', 'main');
} catch (error) {
  console.error('Push failed:', error);
}
```

## Authentication

### Using CredentialManager (Recommended)

Store credentials securely in the OS keychain:

```typescript
import { CredentialManager } from './CredentialManager';

const credentialManager = new CredentialManager();

// Store credentials once
await credentialManager.storeRemoteCredentials('https://github.com/user/repo.git', {
  username: 'your-username',
  password: 'your-personal-access-token'
});

// Use with GitCommands - credentials retrieved automatically
const git = new GitCommands('/path/to/repo', credentialManager);
await git.push('origin', 'main'); // Uses stored credentials
```

See [CREDENTIALS.md](./CREDENTIALS.md) for complete credential management documentation.

### Direct Credentials

You can also provide credentials directly:

#### HTTPS Authentication

```typescript
const credentials = {
  username: 'your-username',
  password: 'your-personal-access-token'
};
```

#### SSH Authentication

```typescript
const credentials = {
  publicKey: '/home/user/.ssh/id_rsa.pub',
  privateKey: '/home/user/.ssh/id_rsa',
  passphrase: 'optional-passphrase'
};
```

## Running the Examples

Example files are provided showing all features:

```bash
# Basic Git operations
npm run example

# Credential management
npm run compile && node dist/credentialExample.js
```

Edit the example files to point to your repository and uncomment the examples you want to test.

## Related Documentation

- [CREDENTIALS.md](./CREDENTIALS.md) - Complete guide to secure credential storage
- [example.ts](./example.ts) - Basic Git operations examples
- [credentialExample.ts](./credentialExample.ts) - Credential management examples

## License

MIT
