import { GitCommands } from './GitCommands';
import { CredentialManager } from './CredentialManager';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Example usage of CredentialManager with GitCommands
 */
async function credentialExample() {
  try {
    // Initialize credential manager
    const credentialManager = new CredentialManager();

    console.log('=== Credential Manager Examples ===\n');

    // Example 1: Store HTTPS credentials for a remote URL
    console.log('Example 1: Storing HTTPS credentials...');
    await credentialManager.storeRemoteCredentials('https://github.com/user/repo.git', {
      username: 'your-username',
      password: 'ghp_yourPersonalAccessToken'
    });
    console.log('✓ Credentials stored securely in OS keychain\n');

    // Example 2: Store SSH credentials
    console.log('Example 2: Storing SSH credentials...');
    const privateKeyPath = path.join(process.env.HOME || '', '.ssh', 'id_rsa');
    const publicKeyPath = path.join(process.env.HOME || '', '.ssh', 'id_rsa.pub');
    
    if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
      const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
      const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
      
      await credentialManager.storeRemoteCredentials('git@github.com:user/repo.git', {
        privateKey: privateKey,
        publicKey: publicKey,
        passphrase: 'optional-passphrase' // Only if your key has a passphrase
      });
      console.log('✓ SSH credentials stored securely\n');
    } else {
      console.log('⚠ SSH keys not found, skipping SSH example\n');
    }

    // Example 3: Retrieve stored credentials
    console.log('Example 3: Retrieving stored credentials...');
    const retrieved = await credentialManager.getRemoteCredentials('https://github.com/user/repo.git');
    if (retrieved) {
      console.log(`✓ Retrieved credentials for user: ${retrieved.username}`);
      console.log(`  Password: ${retrieved.password ? '***' : 'not set'}\n`);
    } else {
      console.log('⚠ No credentials found\n');
    }

    // Example 4: Use GitCommands with credential manager
    console.log('Example 4: Using GitCommands with credential manager...');
    const repoPath = '/path/to/your/repo';
    
    // Create GitCommands instance with credential manager
    const git = new GitCommands(repoPath, credentialManager);
    
    try {
      await git.openRepository();
      console.log('✓ Repository opened\n');

      // Push without providing credentials - will use stored credentials
      console.log('Example 5: Pushing with stored credentials...');
      // await git.push('origin', 'main');
      console.log('✓ Push would use stored credentials automatically\n');

      // Pull without providing credentials
      console.log('Example 6: Pulling with stored credentials...');
      // await git.pull('origin', 'main');
      console.log('✓ Pull would use stored credentials automatically\n');
    } catch (error) {
      console.log(`⚠ Repository not found at ${repoPath}, skipping Git operations\n`);
    }

    // Example 7: List all stored credentials
    console.log('Example 7: Listing all stored credentials...');
    const allCredentials = await credentialManager.listCredentials();
    console.log(`✓ Found ${allCredentials.length} stored credential(s):`);
    allCredentials.forEach(identifier => {
      console.log(`  - ${identifier}`);
    });
    console.log();

    // Example 8: Check if credentials exist
    console.log('Example 8: Checking if credentials exist...');
    const hasCreds = await credentialManager.hasCredentials('https://github.com/user/repo.git');
    console.log(`✓ Credentials exist: ${hasCreds}\n`);

    // Example 9: Store credentials for a specific repository
    console.log('Example 9: Storing repository-specific credentials...');
    await credentialManager.storeRepositoryCredentials('/path/to/repo', {
      username: 'repo-username',
      password: 'repo-token'
    });
    console.log('✓ Repository credentials stored\n');

    // Example 10: Delete credentials
    console.log('Example 10: Deleting credentials (commented out to preserve example)...');
    // await credentialManager.deleteRemoteCredentials('https://github.com/user/repo.git');
    // console.log('✓ Credentials deleted\n');

    // Example 11: Clone with stored credentials
    console.log('Example 11: Cloning with stored credentials...');
    const gitClone = new GitCommands('/tmp/cloned-repo', credentialManager);
    
    // Store credentials first
    await credentialManager.storeRemoteCredentials('https://github.com/user/repo.git', {
      username: 'your-username',
      password: 'your-token'
    });

    // Clone - credentials will be retrieved automatically
    // await gitClone.clone({
    //   url: 'https://github.com/user/repo.git',
    //   localPath: '/tmp/cloned-repo'
    // });
    console.log('✓ Clone would use stored credentials automatically\n');

    console.log('=== All Examples Complete ===');
    console.log('\nNote: Credentials are stored securely in your OS keychain:');
    console.log('  - macOS: Keychain');
    console.log('  - Windows: Credential Vault');
    console.log('  - Linux: libsecret (GNOME Keyring, KDE Wallet, etc.)');

  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the example
if (require.main === module) {
  credentialExample();
}

export { credentialExample };
