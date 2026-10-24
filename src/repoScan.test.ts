import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import * as gitService from './gitService';

describe('scanDirectoryForRepos', () => {
  let tempDir: string;

  const makeRepo = (dir: string, isWorktree: boolean = false) => {
    fs.mkdirSync(dir, { recursive: true });
    if (isWorktree) {
      fs.writeFileSync(path.join(dir, '.git'), 'gitdir: /somewhere/else/.git/worktrees/x');
    } else {
      execSync(`git init -q "${dir}"`);
    }
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-scan-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should find repos in the selected folder and one level deep', async () => {
    makeRepo(path.join(tempDir, 'alpha'));
    makeRepo(path.join(tempDir, 'org', 'beta'));

    const result = await gitService.scanDirectoryForRepos(tempDir);
    expect(result.success).toBe(true);
    const names = result.repos!.map(r => r.name).sort();
    expect(names).toEqual(['alpha', 'beta']);
    expect(result.repos!.every(r => r.isWorktree === false)).toBe(true);
  });

    it('should find the selected folder itself if it is a repository', async () => {
    makeRepo(tempDir);

    const result = await gitService.scanDirectoryForRepos(tempDir);
    expect(result.success).toBe(true);
    expect(result.repos).toHaveLength(1);
    expect(result.repos![0].path).toBe(tempDir);
  });

  it('should respect the depth limit', async () => {
    makeRepo(path.join(tempDir, 'a', 'b', 'c', 'd', 'deep-repo'));

    const shallow = await gitService.scanDirectoryForRepos(tempDir, 2);
    expect(shallow.success).toBe(true);
    expect(shallow.repos).toHaveLength(0);

    const deep = await gitService.scanDirectoryForRepos(tempDir, 5);
    expect(deep.repos).toHaveLength(1);
  });

  it('should skip hidden folders and node_modules entirely', async () => {
    makeRepo(path.join(tempDir, '.hidden', 'secret-repo'));
    makeRepo(path.join(tempDir, 'node_modules', 'dep-repo'));
    makeRepo(path.join(tempDir, 'my', 'node_modules', 'dep-repo'));
    makeRepo(path.join(tempDir, 'visible-repo'));

    const result = await gitService.scanDirectoryForRepos(tempDir);
    const names = result.repos!.map(r => r.name);
    expect(names).toEqual(['visible-repo']);
  });

  it('should mark linked worktrees via the .git file', async () => {
    makeRepo(path.join(tempDir, 'main-repo'));
    makeRepo(path.join(tempDir, 'wt-of-main'), true);

    const result = await gitService.scanDirectoryForRepos(tempDir);
    const wt = result.repos!.find(r => r.name === 'wt-of-main');
    const normal = result.repos!.find(r => r.name === 'main-repo');
    expect(wt!.isWorktree).toBe(true);
    expect(normal!.isWorktree).toBe(false);
  });

  it('should not descend into a repository folder', async () => {
    makeRepo(path.join(tempDir, 'outer-repo'));
    makeRepo(path.join(tempDir, 'outer-repo', 'nested-repo'));

    const result = await gitService.scanDirectoryForRepos(tempDir);
    expect(result.repos).toHaveLength(1);
    expect(result.repos![0].name).toBe('outer-repo');
  });

  it('should return an error for a missing folder', async () => {
    const result = await gitService.scanDirectoryForRepos(path.join(tempDir, 'does-not-exist'));
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});