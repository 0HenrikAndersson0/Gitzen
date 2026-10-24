import * as fs from 'fs';
import * as path from 'path';

interface AppSettings {
  mergeToolPath?: string;
  maxCommits?: number;
  theme?: string;
  aiProvider?: 'agy' | 'claude' | 'ollama' | 'copilot' | 'opencode';
  ollamaModel?: string;
  ollamaHost?: string;
  opencodeModel?: string;
  hasSeenTour?: boolean;
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

export function getMaxCommits(): number {
  const settings = loadSettings();
  return settings.maxCommits ?? 30; // Default to 30 if not set
}

export function setMaxCommits(maxCommits: number): void {
  const settings = loadSettings();
  settings.maxCommits = maxCommits;
  saveSettings(settings);
}

export function getTheme(): string {
  return 'lapom-dark';
}

export function setTheme(theme: string): void {
  const settings = loadSettings();
  settings.theme = theme;
  saveSettings(settings);
}

export function getAllSettings(): AppSettings {
  return loadSettings();
}

export function getAIProvider(): 'agy' | 'claude' | 'ollama' | 'copilot' | 'opencode' {
  const settings = loadSettings();
  return settings.aiProvider ?? 'agy';
}

export function setAIProvider(provider: 'agy' | 'claude' | 'ollama' | 'copilot' | 'opencode'): void {
  const settings = loadSettings();
  settings.aiProvider = provider;
  saveSettings(settings);
}

export function getOllamaModel(): string {
  const settings = loadSettings();
  return settings.ollamaModel ?? '';
}

export function setOllamaModel(model: string): void {
  const settings = loadSettings();
  settings.ollamaModel = model;
  saveSettings(settings);
}

export function getOllamaHost(): string {
  const settings = loadSettings();
  return settings.ollamaHost ?? 'http://localhost:11434';
}

export function setOllamaHost(host: string): void {
  const settings = loadSettings();
  settings.ollamaHost = host;
  saveSettings(settings);
}

export function getOpenCodeModel(): string {
  const settings = loadSettings();
  return settings.opencodeModel ?? '';
}

const OPENCODE_DEFAULT_MODEL = 'ollama/glm-5.3-flash:cloud';

const OPENCODE_OLLAMA_PROVIDER = {
  name: 'Ollama',
  npm: '@ai-sdk/openai-compatible',
  options: { baseURL: 'http://127.0.0.1:11434/v1' },
  models: {
    'deepseek-v4.1-flash:cloud': { limit: { context: 1048576, output: 393216 } },
    'glm-5.3-flash:cloud': { limit: { context: 1048576, output: 1048576 } }
  }
};

export function setOpenCodeModel(model: string): void {
  const settings = loadSettings();
  settings.opencodeModel = model;
  saveSettings(settings);
}

export function getOpenCodeConfigDir(): string {
  const os = require('os');
  const baseDir = userDataPath || path.join(os.homedir(), '.git-gui');
  const dir = path.join(baseDir, 'opencode');
  fs.mkdirSync(dir, { recursive: true });
  const configFile = path.join(dir, 'opencode.json');

  const permission = {
    read: 'deny',
    edit: 'deny',
    glob: 'deny',
    grep: 'deny',
    list: 'deny',
    bash: 'deny',
    task: 'deny',
    todowrite: 'deny',
    webfetch: 'deny',
    websearch: 'deny',
    lsp: 'deny',
    skill: 'deny',
    question: 'deny',
    doom_loop: 'deny',
    external_directory: 'deny'
  };

  let config: any = {};
  if (fs.existsSync(configFile)) {
    try {
      config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    } catch (e) {
      config = {};
    }
  }

  let changed = false;
  if (!config.$schema) {
    config.$schema = 'https://opencode.ai/config.json';
    changed = true;
  }
  if (!config.model) {
    config.model = OPENCODE_DEFAULT_MODEL;
    changed = true;
  }
  if (!config.agent || !config.agent.gitzen) {
    config.agent = Object.assign({}, config.agent, {
      gitzen: {
        description: 'One-shot text generation for Gitzen (commit messages, conflict resolution, branch reviews).',
        permission
      }
    });
    changed = true;
  } else if (!config.agent.gitzen.model) {
    config.agent.gitzen.model = OPENCODE_DEFAULT_MODEL;
    changed = true;
  }
  if (!config.provider || !config.provider.ollama) {
    config.provider = Object.assign({}, config.provider, { ollama: OPENCODE_OLLAMA_PROVIDER });
    changed = true;
  }

  if (changed || !fs.existsSync(configFile)) {
    try {
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to write OpenCode config:', e);
    }
  }
  return dir;
}

export function getOpenCodeAvailableModels(): string[] {
  try {
    const dir = getOpenCodeConfigDir();
    const config = JSON.parse(fs.readFileSync(path.join(dir, 'opencode.json'), 'utf-8'));
    const providerModels = config.provider && config.provider.ollama && config.provider.ollama.models;
    if (providerModels && Object.keys(providerModels).length > 0) {
      return Object.keys(providerModels).map((m) => `ollama/${m}`);
    }
  } catch (e) {
    return [];
  }
  return [];
}

export function getHasSeenTour(): boolean {
  const settings = loadSettings();
  return settings.hasSeenTour ?? false;
}

export function setHasSeenTour(seen: boolean): void {
  const settings = loadSettings();
  settings.hasSeenTour = seen;
  saveSettings(settings);
}
