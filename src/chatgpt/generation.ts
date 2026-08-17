import type { Page } from 'playwright';
import type { IAIGenerationDetector } from '../providers/types.js';

export class ChatGPTGenerationDetector implements IAIGenerationDetector {
  /**
   * Waits for text response completion in ChatGPT.
   */
  async waitForTextResponse(page: Page, label: string): Promise<void> {
    console.log(`[ChatGPTGenerationDetector] Waiting for text response (${label})...`);

    try {
      await page.waitForSelector('button[aria-label="Stop generating"], button[data-testid="stop-button"]', {
        state: 'visible',
        timeout: 4000,
      });
      console.log('[ChatGPTGenerationDetector] Generation streaming started...');
      await page.waitForSelector('button[aria-label="Stop generating"], button[data-testid="stop-button"]', {
        state: 'detached',
        timeout: 120000,
      });
    } catch {
      await page.waitForTimeout(1500);
    }

    console.log(`[ChatGPTGenerationDetector] Text response finished (${label}).`);
  }

  /**
   * Continuous polling detector for ChatGPT image generation.
   * Polls continuously until image is detected or an explicit AI error/policy refusal occurs.
   */
  async waitForGeneration(
    page: Page,
    jobId: string,
    existingImages: string[],
    timeoutMs: number = 600000 // 10 minutes max safety limit
  ): Promise<void> {
    console.log(`[ChatGPTGenerationDetector] Polling for ChatGPT generated image (Job: ${jobId})...`);

    const startTime = Date.now();
    const imageSelector =
      'article img, div.markdown img, div[data-message-author-role="assistant"] img, img[src*="oaiusercontent.com"], img[alt*="Generated"], picture img';

    while (Date.now() - startTime < timeoutMs) {
      // 1. Check for newly rendered images
      const images = await page.locator(imageSelector).all();
      for (const img of images) {
        try {
          const src = await img.getAttribute('src');
          if (
            src &&
            !existingImages.includes(src) &&
            !src.includes('avatar') &&
            !src.includes('profile') &&
            !src.startsWith('data:image/svg')
          ) {
            console.log(`[ChatGPTGenerationDetector] New image detected in ${Date.now() - startTime}ms! (${src.substring(0, 50)}...)`);
            return;
          }
        } catch {
          // Ignore element stale reference during dynamic DOM render
        }
      }

      // 2. Check for AI error or policy refusal message in response
      try {
        const responseElements = await page.locator('div[data-message-author-role="assistant"], div.markdown').all();
        if (responseElements.length > 0) {
          const lastResponse = responseElements[responseElements.length - 1]!;
          const text = (await lastResponse.innerText()).toLowerCase();
          
          if (
            text.includes("can't generate") ||
            text.includes("cannot generate") ||
            text.includes("can't create") ||
            text.includes("cannot create") ||
            text.includes("content policy") ||
            text.includes("unable to generate") ||
            text.includes("error occurred") ||
            text.includes("failed to generate")
          ) {
            const cleanText = text.replace(/\s+/g, ' ').trim().substring(0, 200);
            throw new Error(`ChatGPT AI Refusal/Error: "${cleanText}"`);
          }
        }
      } catch (err: any) {
        if (err.message && err.message.startsWith('ChatGPT AI Refusal/Error')) {
          throw err;
        }
      }

      // Fast 500ms poll interval
      await page.waitForTimeout(500);
    }

    throw new Error(`ChatGPT generation timeout after ${Math.round((Date.now() - startTime) / 1000)}s for job ${jobId}`);
  }
}
