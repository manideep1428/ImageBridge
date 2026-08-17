import type { Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import type { IAIImageUpload } from '../providers/types.js';

export class ChatGPTImageUpload implements IAIImageUpload {
  /**
   * Attaches a single local reference image to ChatGPT.
   */
  async attachReferenceImage(page: Page, localPath: string): Promise<void> {
    const absolutePath = path.resolve(localPath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Reference image file does not exist: ${absolutePath}`);
    }

    console.log(`[ChatGPTImageUpload] Attaching image: ${absolutePath}`);

    // Wait for hidden file input or click attachment button to trigger filechooser
    const hiddenFileInput = page.locator('input[type="file"]');
    const inputCount = await hiddenFileInput.count();

    if (inputCount > 0) {
      await hiddenFileInput.first().setInputFiles(absolutePath);
    } else {
      // Trigger via filechooser event
      const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
      const attachBtn = page.locator('button[aria-label="Attach files"], button[data-testid="attach-button"]').first();
      await attachBtn.click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(absolutePath);
    }

    // Wait for image thumbnail upload preview to complete
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
