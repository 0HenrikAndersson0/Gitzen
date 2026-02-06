import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import * as gitService from './gitService';

describe('gitService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-test-'));
    execSync('git init', { cwd: tempDir });
    execSync('git config user.email "test@example.com"', { cwd: tempDir });
    execSync('git config user.name "Test User"', { cwd: tempDir });
    gitService.openRepository(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should get current branch', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'hello');
    execSync('git add .', { cwd: tempDir });
    execSync('git commit -m "initial commit"', { cwd: tempDir });

    const result = await gitService.getCurrentBranch();
    expect(result.success).toBe(true);
    expect(result.branch).toMatch(/^(master|main)$/);
  });

  it('should get status', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'hello');
    const result = await gitService.getStatus();
    expect(result.success).toBe(true);
    expect(result.files).toContainEqual(expect.objectContaining({
      path: 'test.txt',
      status: 'added',
      staged: false
    }));
  });

  it('should create and checkout branch', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'hello');
    execSync('git add .', { cwd: tempDir });
    execSync('git commit -m "initial commit"', { cwd: tempDir });

    const createResult = await gitService.createBranch('feature-branch', true);
    expect(createResult.success).toBe(true);

    const branchResult = await gitService.getCurrentBranch();
    expect(branchResult.branch).toBe('feature-branch');
  });

  it('should get history', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'hello');
    execSync('git add .', { cwd: tempDir });
    execSync('git commit -m "initial commit"', { cwd: tempDir });

    const result = await gitService.getHistory();
    expect(result.success).toBe(true);
    expect(result.commits?.length).toBeGreaterThan(0);
    expect(result.commits?.[0].message).toContain('initial commit');
  });

  it('should stage and commit files', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'hello');

    // Stage file
    const stageResult = await gitService.stageFiles(['test.txt']);
    expect(stageResult.success).toBe(true);

    let statusResult = await gitService.getStatus();
    expect(statusResult.files?.[0].staged).toBe(true);

    // Commit file
    const commitResult = await gitService.commit('test commit');
    expect(commitResult.success).toBe(true);

    statusResult = await gitService.getStatus();
    expect(statusResult.files?.length).toBe(0);

    const historyResult = await gitService.getHistory();
    expect(historyResult.commits?.[0].message).toBe('test commit\n');
  });

  it('should unstage files', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'hello');
    await gitService.stageFiles(['test.txt']);

    const unstageResult = await gitService.unstageFiles(['test.txt']);
    expect(unstageResult.success).toBe(true);

    const statusResult = await gitService.getStatus();
    expect(statusResult.files?.[0].staged).toBe(false);
  });

  it('should revert file changes', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'hello');
    execSync('git add .', { cwd: tempDir });
    execSync('git commit -m "initial commit"', { cwd: tempDir });

    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'changed');

    const revertResult = await gitService.revertFileChanges('test.txt');
    expect(revertResult.success).toBe(true);

    const content = fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf8');
    expect(content).toBe('hello');
  });

  it('should create and delete tags', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'hello');
    execSync('git add .', { cwd: tempDir });
    execSync('git commit -m "initial commit"', { cwd: tempDir });

    const createResult = await gitService.createTag('v1.0.0');
    expect(createResult.success).toBe(true);

    let tagsResult = await gitService.getTags();
    expect(tagsResult.tags?.map(t => t.name)).toContain('v1.0.0');

    const deleteResult = await gitService.deleteTag('v1.0.0');
    expect(deleteResult.success).toBe(true);

    tagsResult = await gitService.getTags();
    expect(tagsResult.tags?.map(t => t.name)).not.toContain('v1.0.0');
  });

  it('should merge branches', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'initial');
    execSync('git add .', { cwd: tempDir });
    execSync('git commit -m "initial commit"', { cwd: tempDir });

    await gitService.createBranch('feature', true);
    fs.writeFileSync(path.join(tempDir, 'feature.txt'), 'feature');
    execSync('git add .', { cwd: tempDir });
    execSync('git commit -m "feature commit"', { cwd: tempDir });

    // Switch back to master/main
    const mainBranch = (await gitService.getBranches()).branches?.find(b => b === 'master' || b === 'main') || 'master';
    await gitService.checkoutBranch(mainBranch);

    const mergeResult = await gitService.mergeBranchToCurrent('feature');
    expect(mergeResult.success).toBe(true);

    expect(fs.existsSync(path.join(tempDir, 'feature.txt'))).toBe(true);
  });
});
