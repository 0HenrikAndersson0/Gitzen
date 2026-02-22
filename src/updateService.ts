import { app } from 'electron';

export interface UpdateInfo {
  version: string;
  name: string;
  url: string;
  pub_date: string;
  notes: string;
}

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  try {
    const currentVersion = app.getVersion();
    const response = await fetch('https://api.github.com/repos/0HenrikAndersson0/gitzen-release/releases');
    
    if (!response.ok) {
      console.error(`Failed to fetch releases: ${response.statusText}`);
      return null;
    }

    const releases = await response.json() as any[];
    if (!releases || releases.length === 0) {
      return null;
    }

    // GitHub returns releases sorted by date (newest first)
    const latestRelease = releases[0];
    const remoteVersion = latestRelease.tag_name.replace(/^v/, '');

    if (isNewer(currentVersion, remoteVersion)) {
      return {
        version: remoteVersion,
        name: latestRelease.name || latestRelease.tag_name,
        url: latestRelease.html_url,
        pub_date: latestRelease.published_at,
        notes: latestRelease.body
      };
    }
  } catch (error) {
    console.error('Error checking for updates:', error);
  }

  return null;
}

/**
 * Simple semantic version comparison
 * Returns true if remote is newer than current
 */
function isNewer(current: string, remote: string): boolean {
  if (current === remote) return false;

  const currentParts = current.split(/[-.]/);
  const remoteParts = remote.split(/[-.]/);

  const length = Math.max(currentParts.length, remoteParts.length);

  for (let i = 0; i < length; i++) {
    const c = currentParts[i];
    const r = remoteParts[i];

    // If one side is missing, it's usually a pre-release vs stable comparison
    // e.g. 0.9.0 vs 0.9.0-alpha.1
    // Stable is generally considered "newer" than pre-release if versions are same
    if (c === undefined) return true; // remote has more parts (e.g. 0.8 vs 0.8.1)
    if (r === undefined) return false; // current has more parts (e.g. 0.8.1 vs 0.8)

    // Try to compare as numbers
    const cNum = parseInt(c, 10);
    const rNum = parseInt(r, 10);

    if (!isNaN(cNum) && !isNaN(rNum)) {
      if (rNum > cNum) return true;
      if (rNum < cNum) return false;
      // If equal, continue to next part
    } else {
      // Compare as strings (for alpha, beta etc)
      if (r > c) return true;
      if (r < c) return false;
    }
  }

  return false;
}
