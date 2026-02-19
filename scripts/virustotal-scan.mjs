import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const VT_API_KEY = process.env.VT_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY; // e.g., "owner/repo"
const TAG = process.env.GITHUB_REF_NAME; // The tag name

async function uploadFile(filePath) {
    console.log(`Uploading ${filePath} to VirusTotal...`);
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    let uploadUrl = 'https://www.virustotal.com/api/v3/files';
    
    if (fileSize > 32 * 1024 * 1024) {
        const response = await fetch('https://www.virustotal.com/api/v3/files/upload_url', {
            headers: { 'x-apikey': VT_API_KEY }
        });
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
        throw new Error(`VT Upload failed: ${JSON.stringify(result)}`);
    }
    return result.data.id; // Analysis ID
}

async function getAnalysisReport(analysisId) {
    const url = `https://www.virustotal.com/api/v3/analyses/${analysisId}`;
    let attempts = 0;
    while (attempts < 20) {
        const response = await fetch(url, {
            headers: { 'x-apikey': VT_API_KEY }
        });
        const result = await response.json();
        if (result.data.attributes.status === 'completed') {
            return result.data;
        }
        console.log(`Analysis in progress... waiting 30s (attempt ${attempts + 1}/20)`);
        await new Promise(resolve => setTimeout(resolve, 30000));
        attempts++;
    }
    throw new Error('Analysis timed out');
}

async function run() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('No files to scan');
        return;
    }

    const filesToScan = [];
    for (const arg of args) {
        if (arg.includes('*')) {
            const dir = path.dirname(arg);
            const pattern = new RegExp('^' + path.basename(arg).replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
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
        console.log('No matching files found to scan');
        return;
    }

    const results = [];

    for (const filePath of filesToScan) {
        try {
            const analysisId = await uploadFile(filePath);
            const report = await getAnalysisReport(analysisId);
            const stats = report.attributes.stats;
            const permalink = `https://www.virustotal.com/gui/file/${report.meta.file_info.sha256}`;
            
            results.push({
                name: path.basename(filePath),
                stats,
                permalink
            });
        } catch (err) {
            console.error(`Failed to scan ${filePath}:`, err.message);
        }
    }

    if (results.length > 0) {
        let markdown = '\n\n### 🛡️ VirusTotal Scan Results\n\n| File | Status | Detections | Link |\n| --- | --- | --- | --- |\n';
        for (const res of results) {
            const status = res.stats.malicious > 0 ? '❌ Malicious' : '✅ Clean';
            markdown += `| ${res.name} | ${status} | ${res.stats.malicious}/${res.stats.malicious + res.stats.undetected} | [View Report](${res.permalink}) |\n`;
        }

        console.log('Updating GitHub Release notes...');
        // Fetch current release body
        const currentBody = execSync(`gh release view ${TAG} --repo ${REPO} --json body --template '{{.body}}'`, { encoding: 'utf8' });
        const newBody = currentBody + markdown;
        
        // Write new body to temp file to avoid shell escape issues
        fs.writeFileSync('new_body.md', newBody);
        execSync(`gh release edit ${TAG} --repo ${REPO} --notes-file new_body.md`, { env: { ...process.env, GH_TOKEN: GITHUB_TOKEN } });
        fs.unlinkSync('new_body.md');
        console.log('Release notes updated successfully!');
    }
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
