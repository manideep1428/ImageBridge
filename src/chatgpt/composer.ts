import type { Page } from 'playwright';
import type { IAIComposer } from '../providers/types.js';

export class ChatGPTComposer implements IAIComposer {
  /**
   * Enters the prompt into ChatGPT prompt text area.
   */
  async enterPrompt(page: Page, text: string): Promise<void> {
    console.log('[ChatGPTComposer] Entering prompt into ChatGPT...');

    // Selectors for ChatGPT prompt input
    const promptInputSelector = '#prompt-textarea, div[contenteditable="true"]#prompt-textarea';

    await page.waitForSelector(promptInputSelector, { state: 'visible', timeout: 30000 });
    const promptInput = page.locator(promptInputSelector).first();

    await promptInput.click();
    await page.waitForTimeout(300);

    // Clear existing text and fill
    await promptInput.fill(text);
    await page.waitForTimeout(500);
  }

  /**
   * Submits the prompt in ChatGPT.
   */
  async submit(page: Page): Promise<void> {
    console.log('[ChatGPTComposer] Submitting prompt...');

    const sendBtnSelector = 'button[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"]';
    
    // Wait briefly for send button to be enabled
    try {
      await page.waitForSelector(sendBtnSelector, { state: 'visible', timeout: 5000 });
      const sendBtn = page.locator(sendBtnSelector).first();
      await sendBtn.click();
    } catch {
      // Fallback: press Enter key
      console.log('[ChatGPTComposer] Send button click failed or not found, pressing Enter...');
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(1000);
  }
}
