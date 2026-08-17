import type { Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import type { IAIImageUpload } from '../providers/types.js';

export class GeminiImageUpload implements IAIImageUpload {
  /**
   * Attaches a single local reference image to Gemini.
   */
  async attachReferenceImage(page: Page, localPath: string): Promise<void> {
    const absolutePath = path.resolve(localPath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Reference image file does not exist: ${absolutePath}`);
    }

    console.log(`[GeminiImageUpload] Attaching image: ${absolutePath}`);

    const hiddenFileInput = page.locator('input[type="file"]');
    const inputCount = await hiddenFileInput.count();

    if (inputCount > 0) {
      await hiddenFileInput.first().setInputFiles(absolutePath);
    } else {
      // Trigger via filechooser event
      const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
      const uploadBtnSelectors = [
        'button[aria-label*="Upload"]',
        'button[aria-label*="Add image"]',
        'button[aria-label*="file"]',
        'button:has(mat-icon[fonticon="add_photo_alternate"])',
        'button.uploader-button',
      ];

      let clicked = false;
      for (const selector of uploadBtnSelectors) {
        try {
          const btn = page.locator(selector).first();
          if (await btn.isVisible({ timeout: 1500 })) {
            await btn.click();
            clicked = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!clicked) {
        // Force click any upload button in the input area
        const btn = page.locator('rich-textarea + div button, div.input-area button').first();
        await btn.click();
      }

      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(absolutePath);
    }

    // Wait for image thumbnail preview to load
    await page.waitForTimeout(2000);
  }

  /**
   * Attaches multiple local reference images sequentially.
   */
  async attachReferenceImages(page: Page, localPaths: string[]): Promise<void> {
    for (const imgPath of localPaths) {
      await this.attachReferenceImage(page, imgPath);
    }
  }
}
