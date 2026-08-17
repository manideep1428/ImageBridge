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
  generationTimeoutMs: number;
  maxRetries: number;
  debugDir: string;
  tmpDir: string;
  chatgptUrl: string;
  geminiUrl: string;
  instagramAccessToken?: string;
  instagramUsername?: string;
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
    headless: process.env.HEADLESS === 'true',
    generationTimeoutMs: parseInt(process.env.GENERATION_TIMEOUT_MS || '600000', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '2', 10),
    debugDir: path.resolve(process.cwd(), './debug'),
    tmpDir: path.resolve(process.cwd(), './tmp'),
    chatgptUrl: process.env.CHATGPT_URL || 'https://chatgpt.com',
    geminiUrl: process.env.GEMINI_URL || 'https://gemini.google.com',
    instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
    instagramUsername: process.env.INSTAGRAM_USERNAME || '',
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

