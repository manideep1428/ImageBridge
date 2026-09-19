import type { Page } from 'playwright';
import type { BrowserManager } from '../browser/browser-manager.js';
import type {
  IAIProvider,
  AIProviderType,
  GenerateImageOptions,
  GeneratedImage,
} from '../providers/types.js';
import type { HumanInputProvider } from '../human/index.js';
import { GeminiComposer } from './composer.js';
import { GeminiImageUpload } from './image-upload.js';
import { GeminiGenerationDetector } from './generation.js';
import { GeminiImageResult } from './image-result.js';

export interface GeminiPageOptions {
  geminiUrl?: string;
  tmpDir?: string;
  debugDir?: string;
  /** Shared with the composer and the uploader so they click the human way. */
  humanInput?: HumanInputProvider;
}

export class GeminiPage implements IAIProvider {
  readonly providerName: AIProviderType = 'gemini';
  private browserManager: BrowserManager;
  private geminiUrl: string;

  composer: GeminiComposer;
  imageUpload: GeminiImageUpload;
  generationDetector: GeminiGenerationDetector;
  imageResult: GeminiImageResult;

  constructor(browserManager: BrowserManager, options?: GeminiPageOptions) {
    this.browserManager = browserManager;
    this.geminiUrl = options?.geminiUrl || 'https://gemini.google.com';

    // Falls back to the manager's own factory, so callers that do not pass one
    // still get human-like input rather than plain Playwright clicks.
    const humanInput = options?.humanInput ?? browserManager.humanInput;

    this.composer = new GeminiComposer(humanInput);
    this.imageUpload = new GeminiImageUpload(humanInput);
    this.generationDetector = new GeminiGenerationDetector();
    this.imageResult = new GeminiImageResult();
  }

  /**
   * Navigates to Gemini and checks if user is logged into Google session.
   */
  async ensureLoggedIn(): Promise<void> {
    console.log(`[GeminiPage] Navigating to ${this.geminiUrl} and checking Google session...`);
    const page = await this.browserManager.getPage();

    await page.goto(this.geminiUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Check if Gemini prompt area is visible
    try {
      await page.waitForSelector('rich-textarea, div[contenteditable="true"]', {
        state: 'visible',
        timeout: 10000,
      });
      console.log('[GeminiPage] Gemini Google session verified (logged in).');
    } catch {
      throw new Error(
        'Gemini Google session not logged in! Please run "bun run login:gemini" in your terminal to sign into your Google account.'
      );
    }
  }

  /**
   * Starts a fresh chat in Gemini.
   */
  async newChat(): Promise<Page> {
    const page = await this.browserManager.getPage();
    await page.goto(`${this.geminiUrl}/app`, { waitUntil: 'domcontentloaded' });
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

    // Ensure prompt explicitly requests image generation so Gemini triggers Imagen model
    const promptText = options.prompt.trim();
    const imagePrompt = /^(generate|create|draw|paint|picture|image|show|make)/i.test(promptText)
      ? promptText
      : `Generate an image: ${promptText}`;

    await this.composer.enterPrompt(page, imagePrompt);
    await this.composer.submit(page);

    await this.generationDetector.waitForGeneration(
      page,
      options.jobId,
      existingImages,
      options.timeoutMs || 600000
    );

    return await this.imageResult.extractGeneratedImage(page, existingImages);
  }
}
