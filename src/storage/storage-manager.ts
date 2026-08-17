import { BunnyStorage, type ImageStorage } from './bunny-storage.js';
import { LocalStorage } from './local-storage.js';
import { getConfig, type StorageMode } from '../config/config.js';

export interface SaveImageResult {
  url: string;
  cdnUrl?: string;
  localUrl?: string;
  localPath?: string;
}

export interface SaveImageOptions {
  storageMode?: StorageMode;
}

export class StorageManager implements ImageStorage {
  private localStorage: LocalStorage;
  private bunnyStorage: BunnyStorage | null = null;
  private defaultMode: StorageMode;

  constructor() {
    const config = getConfig();
    this.defaultMode = config.storageMode;
    this.localStorage = new LocalStorage();

    // Check if Bunny Storage credentials exist before initializing
    if (config.bunnyStorageZone && config.bunnyStoragePassword && config.bunnyCdnUrl) {
      try {
        this.bunnyStorage = new BunnyStorage();
      } catch (err: any) {
        console.warn('[StorageManager] Bunny Storage init notice:', err.message || err);
      }
    }
  }

  /**
   * Standard ImageStorage upload interface implementation.
   * Returns the primary accessible URL.
   */
  async upload(data: Buffer, filename: string, contentType: string): Promise<string> {
    const res = await this.saveImage(data, filename, contentType);
    return res.url;
  }

  /**
   * Saves image data to Local disk, Bunny CDN, or both according to configured mode.
   * Returns a unified result with primary URL and available paths.
   */
  async saveImage(
    data: Buffer,
    filename: string,
    contentType: string,
    options?: SaveImageOptions
  ): Promise<SaveImageResult> {
    const mode = options?.storageMode || this.defaultMode;
    const result: SaveImageResult = { url: '' };

    // 1. Save Locally if mode is 'local' or 'both', or as fallback if Bunny is not configured
    const shouldSaveLocal = mode === 'local' || mode === 'both' || !this.bunnyStorage;
    if (shouldSaveLocal) {
      try {
        const localRes = await this.localStorage.save(data, filename);
        result.localPath = localRes.localPath;
        result.localUrl = localRes.localUrl;
        result.url = localRes.localUrl;
      } catch (err: any) {
        console.error('[StorageManager] Local save failed:', err.message || err);
      }
    }

    // 2. Upload to Bunny CDN if mode is 'bunny' or 'both'
    const shouldUploadBunny = (mode === 'bunny' || mode === 'both') && this.bunnyStorage;
    if (shouldUploadBunny && this.bunnyStorage) {
      try {
        const cdnUrl = await this.bunnyStorage.upload(data, filename, contentType);
        result.cdnUrl = cdnUrl;
        result.url = cdnUrl; // Primary URL is CDN URL if available
      } catch (err: any) {
        console.error('[StorageManager] Bunny upload failed:', err.message || err);
        // If local succeeded, use local URL as fallback
        if (!result.url && result.localUrl) {
          result.url = result.localUrl;
        }
      }
    }

    if (!result.url) {
      throw new Error(
        `Failed to save generated image. Check your storage configuration (Storage Mode: ${mode}).`
      );
    }

    return result;
  }
}

