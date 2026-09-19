import dotenv from 'dotenv';
import path from 'node:path';
import type { AIProviderType } from '../providers/types.js';

// Load environment variables from .env file
dotenv.config();

export type StorageMode = 'local' | 'bunny' | 'both';

export interface AppConfig {
  port: number;
  aiProvider: AIProviderType;
  storageMode: StorageMode;
  outputDir: string;
  serverBaseUrl: string;
  bunnyStorageZone: string;
  bunnyStoragePassword: string;
  bunnyCdnUrl: string;
  bunnyStorageRegionHost: string;
  chatgptProfileDir: string;
  geminiProfileDir: string;
  headless: boolean;
  useRealChrome: boolean;
  generationTimeoutMs: number;
  maxRetries: number;
  debugDir: string;
  tmpDir: string;
  chatgptUrl: string;
  geminiUrl: string;
  humanInput: boolean;
  humanTyping: boolean;
  humanVisualizeCursor: boolean;
}

/**
 * Reads a boolean environment variable. Unset or empty keeps the default, so an
 * omitted variable never silently turns a feature off.
 */
function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  return ['1', 'true', 'yes'].includes(raw.trim().toLowerCase());
}

export function getConfig(): AppConfig {
  const port = parseInt(process.env.PORT || '3001', 10);
  const providerRaw = (process.env.AI_PROVIDER || 'chatgpt').toLowerCase();
  const aiProvider: AIProviderType = providerRaw === 'gemini' ? 'gemini' : 'chatgpt';

  const rawStorageMode = (process.env.STORAGE_MODE || 'both').toLowerCase();
  const storageMode: StorageMode =
    rawStorageMode === 'local' || rawStorageMode === 'bunny' || rawStorageMode === 'both'
      ? (rawStorageMode as StorageMode)
      : 'both';

  const serverBaseUrl = process.env.SERVER_BASE_URL || `http://localhost:${port}`;

  return {
    port,
    aiProvider,
    storageMode,
    outputDir: path.resolve(process.cwd(), process.env.OUTPUT_DIR || './outputs'),
    serverBaseUrl,
    bunnyStorageZone: process.env.BUNNY_STORAGE_ZONE || '',
    bunnyStoragePassword: process.env.BUNNY_STORAGE_PASSWORD || '',
    bunnyCdnUrl: process.env.BUNNY_CDN_URL || '',
    bunnyStorageRegionHost: process.env.BUNNY_STORAGE_REGION_HOST || 'storage.bunnycdn.com',
    chatgptProfileDir: path.resolve(process.cwd(), process.env.CHATGPT_PROFILE_DIR || './chatgpt-profile'),
    geminiProfileDir: path.resolve(process.cwd(), process.env.GEMINI_PROFILE_DIR || './gemini-profile'),
    headless: envFlag('HEADLESS', false),
    // The container ships Playwright's Chromium, not Google Chrome: channel
    // 'chrome' needs the latter, so the image sets this to false.
    useRealChrome: envFlag('USE_REAL_CHROME', true),
    generationTimeoutMs: parseInt(process.env.GENERATION_TIMEOUT_MS || '600000', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '2', 10),
    debugDir: path.resolve(process.cwd(), './debug'),
    tmpDir: path.resolve(process.cwd(), './tmp'),
    chatgptUrl: process.env.CHATGPT_URL || 'https://chatgpt.com',
    geminiUrl: process.env.GEMINI_URL || 'https://gemini.google.com',
    // On by default: the pointer travels a Bezier path timed by Fitts' law and
    // the prompt is typed key by key, as in the rewards-farmer project.
    humanInput: envFlag('HUMAN_INPUT', true),
    humanTyping: envFlag('HUMAN_TYPING', true),
    humanVisualizeCursor: envFlag('HUMAN_VISUALIZE_CURSOR', false),
  };
}

export function validateBunnyConfig(config: Partial<AppConfig>): void {
  const missing: string[] = [];
  if (!config.bunnyStorageZone) missing.push('BUNNY_STORAGE_ZONE');
  if (!config.bunnyStoragePassword) missing.push('BUNNY_STORAGE_PASSWORD');
  if (!config.bunnyCdnUrl) missing.push('BUNNY_CDN_URL');

  if (missing.length > 0) {
    throw new Error(
      `Missing required Bunny Storage configuration environment variables: ${missing.join(', ')}`
    );
  }
}

