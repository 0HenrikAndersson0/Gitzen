import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const {
    VT_API_KEY,
    GITHUB_TOKEN,
    RELEASE_REPO,
    GITHUB_REPOSITORY,
    GITHUB_REF_NAME: TAG
} = process.env;

const REPO = RELEASE_REPO || GITHUB_REPOSITORY;
const SECTION_HEADER = '### 🛡️ VirusTotal Scan Results';

function validateEnv() {
    const missing = [];
    if (!VT_API_KEY) missing.push('VT_API_KEY');
    if (!GITHUB_TOKEN) missing.push('GITHUB_TOKEN');
    if (!REPO) missing.push('REPO');
    if (!TAG) missing.push('TAG');

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
            return result;
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
            const stats = report.data.attributes.stats;
            const sha256 = report.meta?.file_info?.sha256;
            const permalink = sha256 
                ? `https://www.virustotal.com/gui/file/${sha256}/detection` 
                : `https://www.virustotal.com/gui/analyses/${analysisId}`;
            
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
            const baseUrl = `https://api.github.com/repos/${REPO}/releases`;
            const headers = {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'VirusTotal-Scan-Script'
            };
            
            let currentBody = '';
            let releaseId = '';
            const normalize = (t) => (t || '').replace(/^v\.?/, '').replace(/[-._]/g, '.').toLowerCase().trim();
            const normalizedSearch = normalize(TAG);

            console.log(`Searching for release matching ${TAG}...`);
            
            let releases = [];
            let match = null;
            const maxRetries = 5;
            
            for (let i = 0; i < maxRetries; i++) {
                try {
                    const response = await fetch(baseUrl, { headers });
                    if (!response.ok) throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
                    
                    releases = await response.json();
                    
                    match = releases.find(r => 
                        normalize(r.tag_name) === normalizedSearch ||
                        normalize(r.name || '') === normalizedSearch ||
                        (r.tag_name && normalize(r.tag_name).includes(normalizedSearch)) ||
                        (r.name && normalize(r.name).includes(normalizedSearch))
                    );

                    if (match) break;
                    
                    console.log(`Match not found in ${releases.length} releases. Retry ${i + 1}/${maxRetries} in 15s...`);
                    if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 15000));
                } catch (apiErr) {
                    console.warn(`API call failed during retry ${i + 1}: ${apiErr.message}`);
                    if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 15000));
                }
            }

            if (!match) {
                const availableTags = releases.map(r => `${r.tag_name || 'NO_TAG'} (${r.name || 'NO_NAME'})`).slice(0, 10).join(', ');
                throw new Error(`Could not find a release matching ${TAG} (normalized: ${normalizedSearch}) in ${REPO}. Found ${releases.length} total. Top 10 available: ${availableTags}`);
            }
            
            currentBody = match.body || '';
            releaseId = match.id;
            console.log(`Matched release: ${match.tag_name || match.name} (ID: ${releaseId})`);

            let newBody;
            if (currentBody.includes(SECTION_HEADER)) {
                const parts = currentBody.split(SECTION_HEADER);
                newBody = parts[0].trim() + markdown;
            } else {
                newBody = currentBody.trim() + markdown;
            }
            
            console.log(`Updating release ${releaseId} with new scan results...`);
            const updateResponse = await fetch(`${baseUrl}/${releaseId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ body: newBody })
            });

            if (!updateResponse.ok) {
                const errorData = await updateResponse.json();
                throw new Error(`Failed to update release: ${updateResponse.status} ${JSON.stringify(errorData)}`);
            }

            console.log('✅ Release notes updated successfully!');
        } catch (err) {
            console.error('❌ Failed to update release notes:', err.message);
        }
    }
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
