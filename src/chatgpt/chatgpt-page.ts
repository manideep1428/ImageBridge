import type { Page } from 'playwright';
import type { BrowserManager } from '../browser/browser-manager.js';
import type {
  IAIProvider,
  AIProviderType,
  GenerateImageOptions,
  GeneratedImage,
} from '../providers/types.js';
import { ChatGPTComposer } from './composer.js';
import { ChatGPTImageUpload } from './image-upload.js';
import { ChatGPTGenerationDetector } from './generation.js';
import { ChatGPTImageResult } from './image-result.js';

export interface ChatGPTPageOptions {
  chatgptUrl?: string;
  tmpDir?: string;
  debugDir?: string;
}

export class ChatGPTPage implements IAIProvider {
  readonly providerName: AIProviderType = 'chatgpt';
  private browserManager: BrowserManager;
  private chatgptUrl: string;

  composer: ChatGPTComposer;
  imageUpload: ChatGPTImageUpload;
  generationDetector: ChatGPTGenerationDetector;
  imageResult: ChatGPTImageResult;

  constructor(browserManager: BrowserManager, options?: ChatGPTPageOptions) {
    this.browserManager = browserManager;
    this.chatgptUrl = options?.chatgptUrl || 'https://chatgpt.com';

    this.composer = new ChatGPTComposer();
    this.imageUpload = new ChatGPTImageUpload();
    this.generationDetector = new ChatGPTGenerationDetector();
    this.imageResult = new ChatGPTImageResult();
  }

  /**
   * Navigates to ChatGPT and checks if session is logged in.
   */
  async ensureLoggedIn(): Promise<void> {
    console.log(`[ChatGPTPage] Navigating to ${this.chatgptUrl} and checking session...`);
    const page = await this.browserManager.getPage();

    await page.goto(this.chatgptUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Check if input textarea is present
    try {
      await page.waitForSelector('#prompt-textarea, div[contenteditable="true"]', {
        state: 'visible',
        timeout: 10000,
      });
      console.log('[ChatGPTPage] ChatGPT session verified (logged in).');
    } catch {
      throw new Error(
        'ChatGPT session not logged in! Please run "bun run login:chatgpt" in your terminal to sign into your ChatGPT account.'
      );
    }
  }

  /**
   * Starts a fresh chat in ChatGPT.
   */
  async newChat(): Promise<Page> {
    const page = await this.browserManager.getPage();
    await page.goto(`${this.chatgptUrl}/?oai-dm=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    return page;
  }

  /**
   * Single-shot image generation.
   */
  async generateImage(options: GenerateImageOptions): Promise<GeneratedImage> {
    const page = await this.newChat();
    const existingImages = await this.imageResult.getExistingImageUrls(page);

    if (options.referenceImage) {
      await this.imageUpload.attachReferenceImage(page, options.referenceImage);
    }

    await this.composer.enterPrompt(page, options.prompt);
    await this.composer.submit(page);

    await this.generationDetector.waitForGeneration(
      page,
      options.jobId,
      existingImages,
      options.timeoutMs || 180000
    );

    return await this.imageResult.extractGeneratedImage(page, existingImages);
  }
}
