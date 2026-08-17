import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config/config.js';

export interface LocalStorageConfig {
  outputDir?: string;
  serverBaseUrl?: string;
}

export class LocalStorage {
  private outputDir: string;
  private serverBaseUrl: string;

  constructor(customConfig?: LocalStorageConfig) {
    const envConfig = getConfig();
    this.outputDir = customConfig?.outputDir || envConfig.outputDir;
    this.serverBaseUrl = (customConfig?.serverBaseUrl || envConfig.serverBaseUrl).replace(/\/+$/, '');

    // Ensure output base directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Saves binary data to local output directory and generates local file path and HTTP URL.
   */
  async save(data: Buffer, relativePath: string): Promise<{ localPath: string; localUrl: string }> {
    const sanitized = relativePath.replace(/^\/+/, '');
    const absolutePath = path.resolve(this.outputDir, sanitized);
    const targetDir = path.dirname(absolutePath);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    await fs.promises.writeFile(absolutePath, data);

    const relativeUrlPath = sanitized.replace(/\\/g, '/');
    const localUrl = `${this.serverBaseUrl}/outputs/${relativeUrlPath}`;

    return {
      localPath: absolutePath,
      localUrl,
    };
  }
}
