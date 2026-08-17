import type { Page } from 'playwright';
import type { IAIGenerationDetector } from '../providers/types.js';

export function isGeminiGeneratedImageSrc(src: string | null, existingImages: string[]): boolean {
  if (!src) return false;
  if (existingImages.includes(src)) return false;

  const lower = src.toLowerCase();
  if (
    lower.includes('avatar') ||
    lower.includes('favicon') ||
    lower.includes('logo') ||
    lower.includes('profile') ||
    lower.includes('/ogw/') ||
    lower.includes('/a/') ||
    lower.includes('googleusercontent.com/a/') ||
    lower.includes('googleusercontent.com/ogw/') ||
    lower.includes('google.com/u/') ||
    lower.startsWith('data:image/svg')
  ) {
    return false;
  }

  return true;
}

export class GeminiGenerationDetector implements IAIGenerationDetector {
  /**
   * Waits for text response completion in Gemini.
   */
  async waitForTextResponse(page: Page, label: string): Promise<void> {
    console.log(`[GeminiGenerationDetector] Waiting for Gemini text response (${label})...`);

    try {
      await page.waitForSelector('button[aria-label*="Stop"], button[aria-label*="Pause"]', {
        state: 'visible',
        timeout: 4000,
      });
      console.log('[GeminiGenerationDetector] Generation streaming in progress...');
      await page.waitForSelector('button[aria-label*="Stop"], button[aria-label*="Pause"]', {
        state: 'detached',
        timeout: 120000,
      });
    } catch {
      await page.waitForTimeout(1500);
    }

    console.log(`[GeminiGenerationDetector] Gemini text response finished (${label}).`);
  }

  /**
   * Continuous polling detector for Gemini image generation.
   * Polls continuously until image is detected or an explicit AI error/policy refusal occurs.
   */
  async waitForGeneration(
    page: Page,
    jobId: string,
    existingImages: string[],
    timeoutMs: number = 600000 // 10 minutes max safety limit
  ): Promise<void> {
    console.log(`[GeminiGenerationDetector] Continuous polling for Gemini generated image (Job: ${jobId})...`);

    const startTime = Date.now();
    const imageSelector =
      'model-response img, div.message-content img, message-content img, .image-container img, image-viewer img, img[alt*="Generated"], img[alt*="Image" i], img[src*="googleusercontent.com/gg"], img[src*="blob:"]';

    while (Date.now() - startTime < timeoutMs) {
      // 1. Check for newly generated images
      const images = await page.locator(imageSelector).all();

      for (const img of images) {
        try {
          const src = await img.getAttribute('src');
          if (isGeminiGeneratedImageSrc(src, existingImages)) {
            console.log(
              `[GeminiGenerationDetector] 🎉 New Gemini image detected in ${Math.round(
                (Date.now() - startTime) / 1000
              )}s! (${src!.substring(0, 60)}...)`
            );
            return;
          }
        } catch {
          // Ignore element stale reference during dynamic DOM render
        }
      }

      // 2. Check for AI error or policy refusal message in response
      try {
        const responseElements = await page.locator('model-response, message-content').all();
        if (responseElements.length > 0) {
          const lastResponse = responseElements[responseElements.length - 1]!;
          const text = (await lastResponse.innerText()).toLowerCase();

          if (
            text.includes("can't generate") ||
            text.includes("cannot generate") ||
            text.includes("can't create") ||
            text.includes("cannot create") ||
            text.includes("safety guidelines") ||
            text.includes("unable to generate") ||
            text.includes("something went wrong")
          ) {
            const cleanText = text.replace(/\s+/g, ' ').trim().substring(0, 200);
            throw new Error(`Gemini AI Refusal/Error: "${cleanText}"`);
          }
        }
      } catch (err: any) {
        if (err.message && err.message.startsWith('Gemini AI Refusal/Error')) {
          throw err;
        }
      }

      // Fast 500ms poll interval
      await page.waitForTimeout(500);
    }

    throw new Error(`Gemini generation timeout after ${Math.round((Date.now() - startTime) / 1000)}s for job ${jobId}`);
  }
}
