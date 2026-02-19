import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const {
    VT_API_KEY,
    GITHUB_TOKEN,
    GITHUB_REPOSITORY: REPO,
    GITHUB_REF_NAME: TAG
} = process.env;

const SECTION_HEADER = '### 🛡️ VirusTotal Scan Results';

function validateEnv() {
    const missing = [];
    if (!VT_API_KEY) missing.push('VT_API_KEY');
    if (!GITHUB_TOKEN) missing.push('GITHUB_TOKEN');
    if (!REPO) missing.push('GITHUB_REPOSITORY');
    if (!TAG) missing.push('GITHUB_REF_NAME');

    if (missing.length > 0) {
        console.error(`Error: Missing required environment variables: ${missing.join(', ')}`);
        process.exit(1);
    }
}

async function uploadFile(filePath) {
    console.log(`Uploading ${path.basename(filePath)} to VirusTotal...`);
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    let uploadUrl = 'https://www.virustotal.com/api/v3/files';
    
    // Request special upload URL for files > 32MB
    if (fileSize > 32 * 1024 * 1024) {
        const response = await fetch('https://www.virustotal.com/api/v3/files/upload_url', {
            headers: { 'x-apikey': VT_API_KEY }
        });
        if (!response.ok) throw new Error(`Failed to get upload URL: ${response.statusText}`);
        const data = await response.json();
        uploadUrl = data.data;
    }

    const formData = new FormData();
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, path.basename(filePath));

    const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'x-apikey': VT_API_KEY },
        body: formData
    });

    const result = await response.json();
    if (!response.ok) {
        if (response.status === 429) {
            throw new Error('VirusTotal API rate limit exceeded. Please use a Premium key or reduce scan frequency.');
        }
        throw new Error(`VT Upload failed (${response.status}): ${JSON.stringify(result.error || result)}`);
    }
    return result.data.id;
}

async function getAnalysisReport(analysisId) {
    const url = `https://www.virustotal.com/api/v3/analyses/${analysisId}`;
    let attempts = 0;
    const maxAttempts = 30; // 15 minutes total

    while (attempts < maxAttempts) {
        const response = await fetch(url, {
            headers: { 'x-apikey': VT_API_KEY }
        });
        
        if (!response.ok) {
            if (response.status === 429) {
                console.warn('Rate limited while polling. Waiting 60s...');
                await new Promise(r => setTimeout(r, 60000));
                continue;
            }
            throw new Error(`Polling failed: ${response.statusText}`);
        }

        const result = await response.json();
        const status = result.data.attributes.status;
        
        if (status === 'completed') {
            return result.data;
        }

        console.log(`Analysis status: ${status}... waiting 30s (${attempts + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 30000));
        attempts++;
    }
    throw new Error('Analysis timed out after 15 minutes');
}

async function run() {
    validateEnv();

    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('No files provided for scanning.');
        return;
    }

    const filesToScan = [];
    for (const arg of args) {
        if (arg.includes('*')) {
            const dir = path.dirname(arg);
            const rawPattern = path.basename(arg);
            const pattern = new RegExp('^' + rawPattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir)
                    .filter(f => pattern.test(f))
                    .map(f => path.join(dir, f));
                filesToScan.push(...files);
            }
        } else if (fs.existsSync(arg)) {
            filesToScan.push(arg);
        }
    }

    if (filesToScan.length === 0) {
        console.error('No files found matching the provided paths/patterns.');
        process.exit(1);
    }

    const results = [];
    for (const filePath of filesToScan) {
        try {
            const analysisId = await uploadFile(filePath);
            const report = await getAnalysisReport(analysisId);
            const stats = report.attributes.stats;
            const sha256 = report.meta?.file_info?.sha256 || analysisId.split('-')[1];
            const permalink = `https://www.virustotal.com/gui/file/${sha256}`;
            
            results.push({
                name: path.basename(filePath),
                stats,
                permalink
            });
        } catch (err) {
            console.error(`❌ Failed to scan ${path.basename(filePath)}:`, err.message);
        }
    }

    if (results.length > 0) {
        let markdown = `\n\n${SECTION_HEADER}\n\n| File | Status | Detections | Link |\n| --- | --- | --- | --- |\n`;
        for (const res of results) {
            const isClean = res.stats.malicious === 0;
            const status = isClean ? '✅ Clean' : '❌ Malicious';
            const total = res.stats.malicious + res.stats.undetected;
            markdown += `| \`${res.name}\` | ${status} | ${res.stats.malicious}/${total} | [View Report](${res.permalink}) |\n`;
        }

        console.log(`Updating GitHub Release notes for ${TAG} in ${REPO}...`);
        try {
            // Explicitly set the token in the environment for the gh command
            const ghEnv = { ...process.env, GH_TOKEN: GITHUB_TOKEN };
            
            const currentBody = execSync(`gh release view ${TAG} --repo ${REPO} --json body --template '{{.body}}'`, { 
                encoding: 'utf8',
                env: ghEnv
            });

            // Replace existing section if it exists, otherwise append
            let newBody;
            if (currentBody.includes(SECTION_HEADER)) {
                // Remove everything from the header to the end of that section
                // (Assumes it's the last section or separated by double newlines)
                const parts = currentBody.split(SECTION_HEADER);
                newBody = parts[0].trim() + markdown;
            } else {
                newBody = currentBody.trim() + markdown;
            }
            
            fs.writeFileSync('new_body.md', newBody);
            execSync(`gh release edit ${TAG} --repo ${REPO} --notes-file new_body.md`, { 
                env: { ...process.env, GH_TOKEN: GITHUB_TOKEN } 
            });
            console.log('✅ Release notes updated successfully!');
        } catch (err) {
            console.error('❌ Failed to update release notes:', err.message);
        } finally {
            if (fs.existsSync('new_body.md')) fs.unlinkSync('new_body.md');
        }
    }
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
