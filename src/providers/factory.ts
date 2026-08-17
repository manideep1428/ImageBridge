import type { BrowserManager } from '../browser/browser-manager.js';
import type { AIProviderType, IAIProvider } from './types.js';
import { ChatGPTPage } from '../chatgpt/chatgpt-page.js';
import { GeminiPage } from '../gemini/gemini-page.js';

export interface ProviderFactoryOptions {
  chatgptUrl?: string;
  geminiUrl?: string;
  tmpDir?: string;
  debugDir?: string;
}

/**
 * Creates an instance of an AI provider based on the provider type.
 */
export function createAIProvider(
  type: AIProviderType,
  browserManager: BrowserManager,
  options?: ProviderFactoryOptions
): IAIProvider {
  switch (type) {
    case 'gemini':
      return new GeminiPage(browserManager, {
        geminiUrl: options?.geminiUrl,
        tmpDir: options?.tmpDir,
        debugDir: options?.debugDir,
      });
    case 'chatgpt':
    default:
      return new ChatGPTPage(browserManager, {
        chatgptUrl: options?.chatgptUrl,
        tmpDir: options?.tmpDir,
        debugDir: options?.debugDir,
      });
  }
}
