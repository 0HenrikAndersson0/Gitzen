# GitCommands Class - Quick Start Guide

## Overview

The `GitCommands` class is a TypeScript wrapper around libgit2 (via nodegit) that provides a clean, promise-based API for Git operations in your Electron application.

## Project Structure

```
git_gui/
├── src/
│   ├── GitCommands.ts      # Main GitCommands class
│   ├── example.ts          # Usage examples
│   └── README.md           # Full documentation
├── dist/                   # Compiled JavaScript (generated)
├── tsconfig.json           # TypeScript configuration
└── package.json            # Project dependencies
```

## Quick Start

### 1. Compile the TypeScript code

```bash
npm run compile
```

### 2. Import and use in your code

```typescript
import { GitCommands } from './src/GitCommands';

const git = new GitCommands('/path/to/repo');
await git.openRepository();
```

## Common Operations

### Open a Repository

```typescript
const git = new GitCommands('/path/to/repo');
await git.openRepository();
```

### Clone a Repository

```typescript
const git = new GitCommands('/tmp/new-repo');
await git.clone({
  url: 'https://github.com/user/repo.git',
  localPath: '/tmp/new-repo',
  credentials: {
    username: 'your-username',
    password: 'your-token'
  }
});
```

### Create and Switch to a Branch

```typescript
await git.createBranch('feature/my-feature', true);
```

### Stage and Commit Changes

```typescript
// Stage all changes
await git.stageAll();

// Or stage specific files
await git.stageFiles(['file1.ts', 'file2.ts']);

// Commit
await git.commit({
  message: 'feat: Add new feature',
  author: {
    name: 'Your Name',
    email: 'your@email.com'
  }
});
```

### Push to Remote

```typescript
await git.push('origin', 'main', {
  username: 'your-username',
  password: 'your-token'
});
```

### Pull from Remote

```typescript
await git.pull('origin', 'main', {
  username: 'your-username',
  password: 'your-token'
});
```

### Get Repository Status

```typescript
const status = await git.getStatus();
status.forEach(file => {
  console.log(`${file.path()} - ${file.statusBit()}`);
});
```

### Get Commit History

```typescript
const commits = await git.getHistory(10);
commits.forEach(commit => {
  console.log(`${commit.sha().substring(0, 7)} - ${commit.message()}`);
});
```

## Integration with Electron

In your Electron app, you can use this class in the main process or renderer process:

### Main Process (main.js)

```javascript
const { GitCommands } = require('./dist/GitCommands');

ipcMain.handle('git-status', async (event, repoPath) => {
  const git = new GitCommands(repoPath);
  await git.openRepository();
  return await git.getStatus();
});
```

### Renderer Process (with preload)

```javascript
// In preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gitAPI', {
  getStatus: (repoPath) => ipcRenderer.invoke('git-status', repoPath)
});

// In renderer
const status = await window.gitAPI.getStatus('/path/to/repo');
```

## Available Scripts

- `npm run compile` - Compile TypeScript to JavaScript
- `npm run compile:watch` - Watch mode for development
- `npm run example` - Run the example file

## Authentication

### Secure Storage with CredentialManager (Recommended)

Store credentials securely in the OS keychain:

```typescript
import { CredentialManager } from './src/CredentialManager';

const credentialManager = new CredentialManager();

// Store credentials once
await credentialManager.storeRemoteCredentials('https://github.com/user/repo.git', {
  username: 'your-username',
  password: 'ghp_yourPersonalAccessToken'
});

// Use with GitCommands - credentials retrieved automatically
const git = new GitCommands('/path/to/repo', credentialManager);
await git.push('origin', 'main'); // No credentials needed!
```

### Direct Credentials

You can also provide credentials directly:

#### HTTPS (Personal Access Token)

```typescript
const credentials = {
  username: 'your-username',
  password: 'ghp_yourPersonalAccessToken'
};
```

#### SSH Keys

```typescript
const credentials = {
  publicKey: '/home/user/.ssh/id_rsa.pub',
  privateKey: '/home/user/.ssh/id_rsa',
  passphrase: 'optional-passphrase'
};
```

See [src/CREDENTIALS.md](./src/CREDENTIALS.md) for complete credential management guide.

## Error Handling

Always wrap Git operations in try-catch blocks:

```typescript
try {
  await git.push('origin', 'main');
  console.log('Push successful!');
} catch (error) {
  console.error('Push failed:', error.message);
}
```

## All Available Methods

- `openRepository()` - Open existing repository
- `clone(options)` - Clone from remote
- `createBranch(name, checkout)` - Create new branch
- `checkoutBranch(name)` - Switch branches
- `getCurrentBranch()` - Get current branch name
- `listBranches()` - List all branches
- `stageAll()` - Stage all changes
- `stageFiles(files)` - Stage specific files
- `commit(options)` - Create commit
- `push(remote, branch, credentials)` - Push to remote
- `pull(remote, branch, credentials)` - Pull from remote
- `fetch(remote, credentials)` - Fetch from remote
- `getStatus()` - Get working directory status
- `getHistory(maxCount)` - Get commit history

## Full Documentation

For complete API documentation and more examples, see:
- `src/README.md` - Full API reference
- `src/example.ts` - Comprehensive examples

## Next Steps

1. Integrate `GitCommands` into your Electron UI
2. Add IPC handlers for Git operations
3. Create UI components for branch management, commits, etc.
4. Use `CredentialManager` for secure credential storage (already implemented!)

## Tips

- Always call `openRepository()` before other operations (or use `clone()`)
- Store credentials securely (never hardcode them)
- Handle errors gracefully in your UI
- Use `getStatus()` to update UI state
- Consider implementing a Git operation queue for better UX

Enjoy building your Git GUI! 🚀
