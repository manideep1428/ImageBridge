import type { Page } from 'playwright';
import type { IAIComposer } from '../providers/types.js';

export class GeminiComposer implements IAIComposer {
  /**
   * Enters the prompt into Gemini rich-textarea / contenteditable div.
   */
  async enterPrompt(page: Page, text: string): Promise<void> {
    console.log('[GeminiComposer] Entering prompt into Gemini...');

    // Gemini prompt input selectors
    const selectors = [
      'rich-textarea div[contenteditable="true"]',
      'div[contenteditable="true"][aria-label*="prompt"]',
      'div[contenteditable="true"][aria-label*="Enter"]',
      'div[contenteditable="true"]',
      'p[data-placeholder]',
    ];

    let promptInput = null;
    for (const selector of selectors) {
      try {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 2000 })) {
          promptInput = el;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!promptInput) {
      // Fallback selector wait
      await page.waitForSelector('rich-textarea, div[contenteditable="true"]', { state: 'visible', timeout: 30000 });
      promptInput = page.locator('rich-textarea div[contenteditable="true"], div[contenteditable="true"]').first();
    }

    await promptInput.click();
    await page.waitForTimeout(300);

    // Fill prompt text
    await promptInput.fill(text);
    await page.waitForTimeout(500);
  }

  /**
   * Submits the prompt in Gemini.
   */
  async submit(page: Page): Promise<void> {
    console.log('[GeminiComposer] Submitting prompt in Gemini...');

    const sendBtnSelectors = [
      'button[aria-label*="Send message"]',
      'button[aria-label*="Send"]',
      'button.send-button',
      'button:has(mat-icon[fonticon="send"])',
      'button:has(span:text("send"))',
    ];

    let submitted = false;
    for (const selector of sendBtnSelectors) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 1500 }) && await btn.isEnabled()) {
          await btn.click();
          submitted = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!submitted) {
      console.log('[GeminiComposer] Send button click skipped/failed, pressing Enter...');
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(1000);
  }
}
