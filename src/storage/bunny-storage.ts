import { getConfig, validateBunnyConfig } from '../config/config.js';

export interface ImageStorage {
  upload(data: Buffer, filename: string, contentType: string): Promise<string>;
}

export interface BunnyStorageConfig {
  storageZone: string;
  storagePassword: string;
  cdnUrl: string;
  storageRegionHost?: string;
}

export class BunnyStorage implements ImageStorage {
  private storageZone: string;
  private storagePassword: string;
  private cdnUrl: string;
  private storageRegionHost: string;

  constructor(customConfig?: Partial<BunnyStorageConfig>) {
    const envConfig = getConfig();
    
    this.storageZone = customConfig?.storageZone || envConfig.bunnyStorageZone;
    this.storagePassword = customConfig?.storagePassword || envConfig.bunnyStoragePassword;
    this.cdnUrl = customConfig?.cdnUrl || envConfig.bunnyCdnUrl;
    this.storageRegionHost = customConfig?.storageRegionHost || envConfig.bunnyStorageRegionHost || 'storage.bunnycdn.com';

    validateBunnyConfig({
      bunnyStorageZone: this.storageZone,
      bunnyStoragePassword: this.storagePassword,
      bunnyCdnUrl: this.cdnUrl,
    });
  }

  /**
   * Uploads raw binary image data to Bunny Storage zone.
   * Returns the public Bunny CDN URL for the uploaded file.
   */
  async upload(data: Buffer, filename: string, contentType: string): Promise<string> {
    // Sanitize filename path
    const sanitizedFilename = filename.replace(/^\/+/, '');
    const uploadUrl = `https://${this.storageRegionHost}/${this.storageZone}/${sanitizedFilename}`;

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': this.storagePassword,
        'Content-Type': contentType,
        'Content-Length': data.length.toString(),
      },
      body: new Uint8Array(data),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown storage error');
      throw new Error(`Bunny Storage upload failed (HTTP ${response.status}): ${errorText}`);
    }

    // Clean base CDN URL and combine with path
    const baseUrl = this.cdnUrl.replace(/\/+$/, '');
    return `${baseUrl}/${sanitizedFilename}`;
  }
}
