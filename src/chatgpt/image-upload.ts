import type { Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import type { IAIImageUpload } from '../providers/types.js';
import { humanizedClick, type HumanInputProvider } from '../human/index.js';

export class ChatGPTImageUpload implements IAIImageUpload {
  /**
   * Optional: when present, the attach button is reached and clicked with the
   * human-like pointer instead of a synthetic click.
   */
  private humanInput?: HumanInputProvider;

  constructor(humanInput?: HumanInputProvider) {
    this.humanInput = humanInput;
  }

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
      const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 30000 });
      const attachBtn = page.locator('button[aria-label="Attach files"], button[data-testid="attach-button"]').first();

      // The humanised pointer needs time to travel to the button, so the
      // filechooser is awaited for longer than a plain click would need.
      await humanizedClick(this.humanInput?.forPage(page), attachBtn);

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
