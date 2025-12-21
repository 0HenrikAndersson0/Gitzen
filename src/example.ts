import { GitCommands, CommitOptions } from './GitCommands';
import * as path from 'path';

/**
 * Example usage of the GitCommands class
 */
async function exampleUsage() {
  try {
    // Example 1: Clone a repository
    console.log('Example 1: Cloning a repository...');
    const gitClone = new GitCommands('/tmp/test-repo');
    
    // Uncomment to test cloning
    /*
    await gitClone.clone({
      url: 'https://github.com/example/repo.git',
      localPath: '/tmp/test-repo',
      credentials: {
        username: 'your-username',
        password: 'your-password-or-token'
      }
    });
    console.log('Repository cloned successfully!');
    */

    // Example 2: Open an existing repository
    console.log('\nExample 2: Opening an existing repository...');
    const git = new GitCommands('/path/to/your/repo');
    await git.openRepository();
    console.log('Repository opened successfully!');

    // Example 3: Get current branch
    console.log('\nExample 3: Getting current branch...');
    const currentBranch = await git.getCurrentBranch();
    console.log(`Current branch: ${currentBranch}`);

    // Example 4: List all branches
    console.log('\nExample 4: Listing all branches...');
    const branches = await git.listBranches();
    console.log('Branches:', branches);

    // Example 5: Create a new branch
    console.log('\nExample 5: Creating a new branch...');
    await git.createBranch('feature/new-feature', false);
    console.log('Branch created successfully!');

    // Example 6: Checkout a branch
    console.log('\nExample 6: Checking out a branch...');
    await git.checkoutBranch('feature/new-feature');
    console.log('Branch checked out successfully!');

    // Example 7: Get repository status
    console.log('\nExample 7: Getting repository status...');
    const status = await git.getStatus();
    console.log(`Files changed: ${status.length}`);
    status.forEach(file => {
      console.log(`  ${file.path()} - ${file.statusBit()}`);
    });

    // Example 8: Stage all changes
    console.log('\nExample 8: Staging all changes...');
    await git.stageAll();
    console.log('All changes staged!');

    // Example 9: Stage specific files
    console.log('\nExample 9: Staging specific files...');
    await git.stageFiles(['file1.txt', 'file2.txt']);
    console.log('Specific files staged!');

    // Example 10: Commit changes
    console.log('\nExample 10: Committing changes...');
    const commitOptions: CommitOptions = {
      message: 'feat: Add new feature',
      author: {
        name: 'Your Name',
        email: 'your.email@example.com'
      }
    };
    const commitId = await git.commit(commitOptions);
    console.log(`Commit created: ${commitId.tostrS()}`);

    // Example 11: Push changes
    console.log('\nExample 11: Pushing changes...');
    await git.push('origin', 'feature/new-feature', {
      username: 'your-username',
      password: 'your-password-or-token'
    });
    console.log('Changes pushed successfully!');

    // Example 12: Pull changes
    console.log('\nExample 12: Pulling changes...');
    await git.pull('origin', 'main', {
      username: 'your-username',
      password: 'your-password-or-token'
    });
    console.log('Changes pulled successfully!');

    // Example 13: Fetch changes
    console.log('\nExample 13: Fetching changes...');
    await git.fetch('origin', {
      username: 'your-username',
      password: 'your-password-or-token'
    });
    console.log('Changes fetched successfully!');

    // Example 14: Get commit history
    console.log('\nExample 14: Getting commit history...');
    const commits = await git.getHistory(10);
    console.log(`Last ${commits.length} commits:`);
    commits.forEach(commit => {
      console.log(`  ${commit.sha().substring(0, 7)} - ${commit.message().split('\n')[0]}`);
      console.log(`    Author: ${commit.author().name()} <${commit.author().email()}>`);
      console.log(`    Date: ${commit.date()}`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the example
if (require.main === module) {
  exampleUsage();
}

export { exampleUsage };
