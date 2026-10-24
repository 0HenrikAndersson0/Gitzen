import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import * as gitService from './gitService';

describe('worktrees', () => {
  let tempDir: string;
  let worktreesDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-wt-'));
    execSync('git init', { cwd: tempDir });
    execSync('git config user.email "test@example.com"', { cwd: tempDir });
    execSync('git config user.name "Test User"', { cwd: tempDir });

    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test Repo');
    execSync('git add README.md', { cwd: tempDir });
    execSync('git commit -m "initial commit"', { cwd: tempDir });
    execSync('git branch feature-x', { cwd: tempDir });

    worktreesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-wt-dirs-'));

    await gitService.openRepository(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(worktreesDir, { recursive: true, force: true });
  });

  const wtPath = (name: string) => path.join(worktreesDir, name);

  it('should list the main worktree as current', async () => {
    const result = await gitService.getWorktrees();
    expect(result.success).toBe(true);
    expect(result.worktrees).toHaveLength(1);

    const wt = result.worktrees![0];
    expect(wt.main).toBe(true);
    expect(wt.current).toBe(true);
    expect(wt.bare).toBe(false);
    expect(wt.detached).toBe(false);

    const { branch } = await gitService.getCurrentBranch();
    expect(wt.branch).toBe(branch);
  });

  it('should add and list a worktree on an existing branch', async () => {
    const addResult = await gitService.addWorktree({ path: wtPath('wt1'), branch: 'feature-x' });
    expect(addResult.success).toBe(true);

    const result = await gitService.getWorktrees();
    expect(result.worktrees).toHaveLength(2);

    const wt = result.worktrees!.find(w => w.branch === 'feature-x');
    expect(wt).toBeDefined();
    expect(wt!.main).toBe(false);
    expect(wt!.current).toBe(false);
    expect(wt!.detached).toBe(false);
    expect(fs.existsSync(path.join(wtPath('wt1'), 'README.md'))).toBe(true);
  });

  it('should refuse a second worktree on the same branch', async () => {
    await gitService.addWorktree({ path: wtPath('wt1'), branch: 'feature-x' });
    const second = await gitService.addWorktree({ path: wtPath('wt2'), branch: 'feature-x' });
    expect(second.success).toBe(false);
    expect(second.error).toBeTruthy();
  });

  it('should create a new branch worktree from a start point', async () => {
    const addResult = await gitService.addWorktree({
      path: wtPath('wt-new'),
      newBranch: 'feature-y',
      startPoint: 'HEAD',
    });
    expect(addResult.success).toBe(true);

    const branches = await gitService.getBranches();
    expect(branches.branches).toContain('feature-y');

    const result = await gitService.getWorktrees();
    expect(result.worktrees!.find(w => w.branch === 'feature-y')).toBeDefined();
  });

  it('should add a detached worktree', async () => {
    const addResult = await gitService.addWorktree({ path: wtPath('wt-detached'), detach: true });
    expect(addResult.success).toBe(true);

    const result = await gitService.getWorktrees();
    const wt = result.worktrees!.find(w => w.path === fs.realpathSync(wtPath('wt-detached')));
    expect(wt).toBeDefined();
    expect(wt!.detached).toBe(true);
    expect(wt!.branch).toBeUndefined();
    expect(wt!.head).toHaveLength(40);
  });

  it('should remove a clean worktree', async () => {
    await gitService.addWorktree({ path: wtPath('wt1'), branch: 'feature-x' });
    const removeResult = await gitService.removeWorktree(wtPath('wt1'));
    expect(removeResult.success).toBe(true);

    const result = await gitService.getWorktrees();
    expect(result.worktrees).toHaveLength(1);
    expect(fs.existsSync(wtPath('wt1'))).toBe(false);
  });

  it('should require force to remove a dirty worktree', async () => {
    await gitService.addWorktree({ path: wtPath('wt1'), branch: 'feature-x' });
    fs.writeFileSync(path.join(wtPath('wt1'), 'dirty.txt'), 'uncommitted');

    const removeResult = await gitService.removeWorktree(wtPath('wt1'));
    expect(removeResult.success).toBe(false);

    const forceResult = await gitService.removeWorktree(wtPath('wt1'), true);
    expect(forceResult.success).toBe(true);

    const result = await gitService.getWorktrees();
    expect(result.worktrees).toHaveLength(1);
  });

  it('should refuse to remove the currently open worktree', async () => {
    const removeResult = await gitService.removeWorktree(tempDir);
    expect(removeResult.success).toBe(false);
    expect(removeResult.error).toContain('currently open');
  });

  it('should lock and unlock a worktree with its reason reflected in the list', async () => {
    await gitService.addWorktree({ path: wtPath('wt1'), branch: 'feature-x' });

    const lockResult = await gitService.lockWorktree(wtPath('wt1'), 'ci builds running here');
    expect(lockResult.success).toBe(true);

    let result = await gitService.getWorktrees();
    let wt = result.worktrees!.find(w => w.branch === 'feature-x');
    expect(wt!.locked).toBe('ci builds running here');

    // Locked worktrees must not be removed non-forcefully
    const removeLocked = await gitService.removeWorktree(wtPath('wt1'));
    expect(removeLocked.success).toBe(false);

    const unlockResult = await gitService.unlockWorktree(wtPath('wt1'));
    expect(unlockResult.success).toBe(true);

    result = await gitService.getWorktrees();
    wt = result.worktrees!.find(w => w.branch === 'feature-x');
    expect(wt!.locked).toBeUndefined();
  });

  it('should flag prunable worktrees and prune them', async () => {
    await gitService.addWorktree({ path: wtPath('wt1'), branch: 'feature-x' });
    fs.rmSync(wtPath('wt1'), { recursive: true, force: true });

    let result = await gitService.getWorktrees();
    expect(result.worktrees).toHaveLength(2);
    const stale = result.worktrees!.find(w => w.main === false)!;
    expect(stale.prunable).toBeTruthy();

    const pruneResult = await gitService.pruneWorktrees();
    expect(pruneResult.success).toBe(true);

    result = await gitService.getWorktrees();
    expect(result.worktrees).toHaveLength(1);
    expect(result.worktrees![0].main).toBe(true);
  });

  it('should mark a linked worktree as current when opened', async () => {
    await gitService.addWorktree({ path: wtPath('wt1'), branch: 'feature-x' });
    await gitService.openRepository(wtPath('wt1'));

    const result = await gitService.getWorktrees();
    const linked = result.worktrees!.find(w => w.branch === 'feature-x');
    const main = result.worktrees!.find(w => w.main);
    expect(linked!.current).toBe(true);
    expect(main!.current).toBe(false);
    expect(linked!.main).toBe(false);
  });
});