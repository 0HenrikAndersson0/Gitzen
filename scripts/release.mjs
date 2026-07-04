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
        // Logic: Increment patch and preserve the current suffix (e.g., -beta-1, -alpha-1)
        const versionMatch = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
        if (!versionMatch) {
            console.error(`❌ Current version ${currentVersion} is not valid semver.`);
            process.exit(1);
        }

        const [_, major, minor, patch, suffix] = versionMatch;
        const newPatch = parseInt(patch) + 1;
        const suffixPart = suffix ? `-${suffix}` : '';
        const newVersion = `${major}.${minor}.${newPatch}${suffixPart}`;

        console.log(`🚀 Preparing release: ${currentVersion} -> ${newVersion}`);

        // Create and checkout release branch
        const releaseBranch = `release/${newVersion}`;
        console.log(`🌿 Creating release branch ${releaseBranch}...`);
        execSync(`git checkout -b ${releaseBranch}`, { stdio: 'inherit' });

        // 4. Run npm version to update files (package.json, package-lock.json)
        console.log('📦 Bumping package versions...');
        execSync(`npm version ${newVersion} --no-git-tag-version`, { stdio: 'inherit' });

        const tagName = `v${newVersion}`;

        // 5. Generate Release Notes
        console.log('📝 Generating release notes...');
        try {
            // Find previous tag
            const previousTag = execSync('git describe --tags --abbrev=0').toString().trim();
            console.log(`   Previous tag: ${previousTag}`);

            const commits = execSync(`git log ${previousTag}..HEAD --pretty=format:"- %s (%h)" --no-merges`).toString().trim();

            const releaseNotes = `# Release Notes: ${tagName}\n\n## Changes\n\n${commits}\n\n---\n*Compared to ${previousTag}*`;

            fs.writeFileSync('RELEASE_NOTES.md', releaseNotes);
            console.log('   ✅ RELEASE_NOTES.md created.');
        } catch (e) {
            console.warn('   ⚠️ Could not generate release notes (first release?):', e.message);
        }

        // 6. Stage files
        console.log('📝 Staging changes...');
        const filesToStage = ['package.json', 'package-lock.json'];
        if (fs.existsSync('RELEASE_NOTES.md')) {
            filesToStage.push('RELEASE_NOTES.md');
        }
        execSync(`git add ${filesToStage.join(' ')}`, { stdio: 'inherit' });

        // 7. Commit
        console.log('🚀 Committing...');
        execSync(`git commit -m "chore: release v${newVersion}"`, { stdio: 'inherit' });

        // 8. Tag
        console.log(`🏷️  Creating tag ${tagName}...`);
        execSync(`git tag -a ${tagName} -m "Release ${tagName}"`, { stdio: 'inherit' });

        // 9. Push
        console.log('⬆️  Pushing changes and tag...');
        execSync(`git push origin ${releaseBranch}`, { stdio: 'inherit' });
        execSync(`git push origin ${tagName}`, { stdio: 'inherit' });

        console.log('✅ Release script completed successfully!');
        console.log(`   New Version: ${newVersion}`);
        console.log(`   Release Branch: ${releaseBranch}`);
        console.log(`   Tag: ${tagName}`);
        console.log('   Changes pushed to remote.');

    } catch (error) {
        console.error('❌ Release failed:', error.message);
        process.exit(1);
    }
}

run();
