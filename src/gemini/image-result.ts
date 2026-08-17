import type { Page } from 'playwright';
import type { IAIImageResult, GeneratedImage } from '../providers/types.js';
import { isGeminiGeneratedImageSrc } from './generation.js';

const IMAGE_SELECTORS =
  'model-response img, div.message-content img, message-content img, .image-container img, image-viewer img, img[alt*="Generated"], img[alt*="Image" i], img[src*="googleusercontent.com/gg"], img[src*="blob:"]';

export class GeminiImageResult implements IAIImageResult {
  /**
   * Gets list of all current image src URLs in Gemini response content.
   */
  async getExistingImageUrls(page: Page): Promise<string[]> {
    const images = await page.locator(IMAGE_SELECTORS).all();
    const urls: string[] = [];
    for (const img of images) {
      try {
        const src = await img.getAttribute('src');
        if (src) urls.push(src);
      } catch {
        // Ignore stale elements
      }
    }
    return urls;
  }

  /**
   * Extracts the newly generated image buffer and metadata from Gemini.
   * Supports blob: URLs, data: URLs, and standard HTTP URLs.
   */
  async extractGeneratedImage(page: Page, existingImages: string[]): Promise<GeneratedImage> {
    console.log('[GeminiImageResult] Extracting newly generated image from Gemini...');

    const images = await page.locator(IMAGE_SELECTORS).all();
    let newImgSrc: string | null = null;

    for (let i = images.length - 1; i >= 0; i--) {
      const img = images[i]!;
      try {
        const src = await img.getAttribute('src');
        if (isGeminiGeneratedImageSrc(src, existingImages)) {
          newImgSrc = src;
          break;
        }
      } catch {
        // Ignore stale elements
      }
    }

    if (!newImgSrc) {
      throw new Error('Failed to find generated image element in Gemini response.');
    }

    console.log(`[GeminiImageResult] Fetching generated image data from: ${newImgSrc.substring(0, 60)}...`);

    let buffer: Buffer;
    let contentType = 'image/png';

    if (newImgSrc.startsWith('blob:')) {
      // Evaluate in page context to convert blob: URL to Base64
      const dataUrl = await page.evaluate(async (blobUrl) => {
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }, newImgSrc);

      const matches = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      if (matches && matches[1] && matches[2]) {
        contentType = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(dataUrl.split(',')[1] || '', 'base64');
      }
    } else if (newImgSrc.startsWith('data:')) {
      const matches = newImgSrc.match(/^data:(image\/\w+);base64,(.+)$/);
      if (matches && matches[1] && matches[2]) {
        contentType = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(newImgSrc.split(',')[1] || '', 'base64');
      }
    } else {
      const res = await page.request.get(newImgSrc);
      if (!res.ok()) {
        throw new Error(`HTTP ${res.status()} fetching generated image from ${newImgSrc}`);
      }
      buffer = await res.body();
      contentType = res.headers()['content-type'] || 'image/png';
    }

    const extension = contentType.includes('webp')
      ? 'webp'
      : contentType.includes('jpeg') || contentType.includes('jpg')
      ? 'jpg'
      : 'png';

    return {
      data: buffer,
      contentType,
      extension,
    };
  }
}
