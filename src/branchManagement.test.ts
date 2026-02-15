import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import * as gitService from './gitService';

describe('branch management', () => {
  let tempDir: string;
  let remoteDir: string;

  beforeEach(() => {
    // Set up a "remote" repository
    remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-remote-'));
    execSync('git init --bare', { cwd: remoteDir });

    // Set up local repository
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-local-'));
    execSync('git init', { cwd: tempDir });
    execSync('git config user.email "test@example.com"', { cwd: tempDir });
    execSync('git config user.name "Test User"', { cwd: tempDir });
    
    // Initial commit to have a master/main branch
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test Repo');
    execSync('git add README.md', { cwd: tempDir });
    execSync('git commit -m "initial commit"', { cwd: tempDir });
    
    // Add remote
    execSync(`git remote add origin ${remoteDir}`, { cwd: tempDir });
    execSync('git push origin HEAD', { cwd: tempDir });
    
    gitService.openRepository(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(remoteDir, { recursive: true, force: true });
  });

  it('should not allow deleting the current branch', async () => {
    const currentResult = await gitService.getCurrentBranch();
    const currentBranch = currentResult.branch!;
    
    const deleteResult = await gitService.deleteBranch(currentBranch);
    expect(deleteResult.success).toBe(false);
    expect(deleteResult.error).toContain('currently checked out');
  });

  it('should allow deleting other branches', async () => {
    await gitService.createBranch('other-branch', false);
    
    const deleteResult = await gitService.deleteBranch('other-branch');
    expect(deleteResult.success).toBe(true);
    
    const branches = await gitService.getBranches();
    expect(branches.branches).not.toContain('other-branch');
  });

  it('should handle deleting a remote branch that is already gone', async () => {
    // Create a branch and push it
    await gitService.createBranch('to-be-deleted', false);
    execSync('git push origin to-be-deleted', { cwd: tempDir });
    
    // Verify it exists in tracking
    const remoteBranches = execSync('git branch -r', { cwd: tempDir });
    expect(remoteBranches.toString()).toContain('origin/to-be-deleted');
    
    // Manually delete from "remote" directly to simulate it being gone
    execSync('git branch -D to-be-deleted', { cwd: remoteDir });
    
    // Now try to delete it via gitService
    const deleteResult = await gitService.deleteRemoteBranch('origin/to-be-deleted');
    
    // Should be successful (or at least not fail the user's intent)
    expect(deleteResult.success).toBe(true);
    
    // Local tracking branch should be gone
    const remoteBranchesAfter = execSync('git branch -r', { cwd: tempDir });
    expect(remoteBranchesAfter.toString()).not.toContain('origin/to-be-deleted');
  });

  it('should prune remote branches on fetch', async () => {
    // 1. Create a branch on remote
    // We do this by pushing from local then deleting locally
    await gitService.createBranch('stale-branch', false);
    execSync('git push origin stale-branch', { cwd: tempDir });
    
    // 2. Verify tracking branch exists
    let remoteBranches = execSync('git branch -r', { cwd: tempDir }).toString();
    expect(remoteBranches).toContain('origin/stale-branch');
    
    // 3. Delete from remote
    execSync('git branch -D stale-branch', { cwd: remoteDir });
    
    // 4. Fetch without prune (verify it's still there if we hadn't added prune)
    // Actually our code now has prune, so it should be gone after fetchRemote
    const fetchResult = await gitService.fetchRemote('origin');
    expect(fetchResult.success).toBe(true);
    
    // 5. Verify it's gone from local tracking
    remoteBranches = execSync('git branch -r', { cwd: tempDir }).toString();
    expect(remoteBranches).not.toContain('origin/stale-branch');
  });
});
