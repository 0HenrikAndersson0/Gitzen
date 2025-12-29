import * as fs from 'fs';
import * as path from 'path';

interface AppSettings {
  mergeToolPath?: string;
}

let userDataPath: string | null = null;

export function setUserDataPath(path: string): void {
  userDataPath = path;
}

function getSettingsFilePath(): string {
  if (!userDataPath) {
    // Fallback to a temp directory if userDataPath is not set
    const os = require('os');
    userDataPath = path.join(os.homedir(), '.git-gui');
  }
  return path.join(userDataPath, 'settings.json');
}

function loadSettings(): AppSettings {
  try {
    const filePath = getSettingsFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return {};
}

function saveSettings(settings: AppSettings): void {
  try {
    const filePath = getSettingsFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

export function getMergeToolPath(): string | undefined {
  const settings = loadSettings();
  return settings.mergeToolPath;
}

export function setMergeToolPath(mergeToolPath: string): void {
  const settings = loadSettings();
  settings.mergeToolPath = mergeToolPath;
  saveSettings(settings);
}

export function getAllSettings(): AppSettings {
  return loadSettings();
}

