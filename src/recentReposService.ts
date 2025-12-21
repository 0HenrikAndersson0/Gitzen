import * as fs from 'fs';
import * as path from 'path';

interface RecentRepo {
  path: string;
  name: string;
  lastOpened: number;
}

const MAX_RECENT_REPOS = 10;

let userDataPath: string | null = null;

export function setUserDataPath(path: string): void {
  userDataPath = path;
}

function getRecentReposFilePath(): string {
  if (!userDataPath) {
    // Fallback to a temp directory if userDataPath is not set
    const os = require('os');
    userDataPath = path.join(os.homedir(), '.git-gui');
  }
  return path.join(userDataPath, 'recent-repos.json');
}

function loadRecentRepos(): RecentRepo[] {
  try {
    const filePath = getRecentReposFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const repos = JSON.parse(data);
      // Sort by lastOpened (most recent first)
      return repos.sort((a: RecentRepo, b: RecentRepo) => b.lastOpened - a.lastOpened);
    }
  } catch (error) {
    console.error('Failed to load recent repos:', error);
  }
  return [];
}

function saveRecentRepos(repos: RecentRepo[]): void {
  try {
    const filePath = getRecentReposFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(repos, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save recent repos:', error);
  }
}

export function getRecentRepos(): RecentRepo[] {
  return loadRecentRepos();
}

export function addRecentRepo(repoPath: string): void {
  const repos = loadRecentRepos();
  
  // Remove if already exists
  const filtered = repos.filter(r => r.path !== repoPath);
  
  // Get repo name from path
  const name = path.basename(repoPath);
  
  // Add to beginning
  const newRepo: RecentRepo = {
    path: repoPath,
    name: name,
    lastOpened: Date.now(),
  };
  
  filtered.unshift(newRepo);
  
  // Keep only MAX_RECENT_REPOS
  const limited = filtered.slice(0, MAX_RECENT_REPOS);
  
  saveRecentRepos(limited);
}

export function removeRecentRepo(repoPath: string): void {
  const repos = loadRecentRepos();
  const filtered = repos.filter(r => r.path !== repoPath);
  saveRecentRepos(filtered);
}

