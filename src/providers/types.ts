import type { Page } from 'playwright';

export type AIProviderType = 'chatgpt' | 'gemini';

/**
 * Result of an AI image generation operation.
 */
export interface GeneratedImage {
  data: Buffer;
  contentType: string;
  extension: string;
}

/**
 * Options for single-shot image generation.
 */
export interface GenerateImageOptions {
  prompt: string;
  referenceImage: string;
  jobId: string;
  timeoutMs?: number;
}

/**
 * Composer sub-module: handles entering text and submitting prompts.
 */
export interface IAIComposer {
  enterPrompt(page: Page, text: string): Promise<void>;
  submit(page: Page): Promise<void>;
}

/**
 * Image upload sub-module: handles attaching reference images.
 */
export interface IAIImageUpload {
  attachReferenceImage(page: Page, localPath: string): Promise<void>;
  attachReferenceImages(page: Page, localPaths: string[]): Promise<void>;
}

/**
 * Generation detector sub-module: waits for AI to finish responding.
 */
export interface IAIGenerationDetector {
  waitForTextResponse(page: Page, label: string): Promise<void>;
  waitForGeneration(page: Page, jobId: string, existingImages: string[], timeoutMs: number): Promise<void>;
}

/**
 * Image result sub-module: extracts generated images from the AI response.
 */
export interface IAIImageResult {
  getExistingImageUrls(page: Page): Promise<string[]>;
  extractGeneratedImage(page: Page, existingImages: string[]): Promise<GeneratedImage>;
}

/**
 * Common interface for all AI providers (ChatGPT, Gemini, etc.).
 * Both browser-automation providers must implement this contract.
 */
export interface IAIProvider {
  readonly providerName: AIProviderType;

  /** Ensure the user is logged in (navigate to site, check session). */
  ensureLoggedIn(): Promise<void>;

  /** Start a fresh chat/conversation. Returns the Playwright Page. */
  newChat(): Promise<Page>;

  /** Single-shot: upload image + prompt → wait → extract generated image. */
  generateImage(options: GenerateImageOptions): Promise<GeneratedImage>;

  /** Sub-modules for the multi-step pipeline flow. */
  composer: IAIComposer;
  imageUpload: IAIImageUpload;
  generationDetector: IAIGenerationDetector;
  imageResult: IAIImageResult;
}
