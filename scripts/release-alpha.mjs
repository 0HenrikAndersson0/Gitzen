import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

function run() {
    try {
        // 1. Verify git is clean
        const status = execSync('git status --porcelain').toString().trim();
        if (status) {
            console.error('❌ Git working directory is not clean. Please commit or stash changes first.');
            process.exit(1);
        }

        // Verify we are on a branch
        const branch = execSync('git branch --show-current').toString().trim();
        if (!branch) {
            console.error('❌ You are in a detached HEAD state. Please checkout a branch first.');
            process.exit(1);
        }

        // 2. Read package.json
        const pkgPath = path.resolve('package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const currentVersion = pkg.version;

        // 3. Calculate new version
        // Logic: Increment patch and force suffix to -alpha-1
        // Matches x.y.z or x.y.z-suffix
        const versionMatch = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
        if (!versionMatch) {
            console.error(`❌ Current version ${currentVersion} is not valid semver.`);
            process.exit(1);
        }

        const [_, major, minor, patch] = versionMatch;
        const newPatch = parseInt(patch) + 1;
        const newVersion = `${major}.${minor}.${newPatch}-alpha-1`;

        console.log(`🚀 Preparing release: ${currentVersion} -> ${newVersion}`);

        // 4. Run npm version to update files (package.json, package-lock.json)
        // --no-git-tag-version: we handle tagging manually to ensure format
        console.log('📦 Bumping package versions...');
        execSync(`npm version ${newVersion} --no-git-tag-version`, { stdio: 'inherit' });

        // 5. Stage files
        console.log('📝 Staging changes...');
        execSync('git add package.json package-lock.json', { stdio: 'inherit' });

        // 6. Commit
        console.log('🚀 Committing...');
        execSync(`git commit -m "chore: release v${newVersion}"`, { stdio: 'inherit' });

        // 7. Tag
        const tagName = `v${newVersion}`;
        console.log(`🏷️  Creating tag ${tagName}...`);
        execSync(`git tag -a ${tagName} -m "Release ${tagName}"`, { stdio: 'inherit' });

        // 8. Push
        console.log('⬆️  Pushing changes and tag...');
        execSync(`git push origin ${branch}`, { stdio: 'inherit' });
        execSync(`git push origin ${tagName}`, { stdio: 'inherit' });

        console.log('✅ Release script completed successfully!');
        console.log(`   New Version: ${newVersion}`);
        console.log(`   Tag: ${tagName}`);
        console.log('   Changes pushed to remote.');

    } catch (error) {
        console.error('❌ Release failed:', error.message);
        process.exit(1);
    }
}

run();
