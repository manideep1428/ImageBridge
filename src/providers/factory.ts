import type { BrowserManager } from '../browser/browser-manager.js';
import type { AIProviderType, IAIProvider } from './types.js';
import type { HumanInputProvider } from '../human/index.js';
import { ChatGPTPage } from '../chatgpt/chatgpt-page.js';
import { GeminiPage } from '../gemini/gemini-page.js';

export interface ProviderFactoryOptions {
  chatgptUrl?: string;
  geminiUrl?: string;
  tmpDir?: string;
  debugDir?: string;
  /**
   * Overrides the manager's own human input factory. Left unset, every provider
   * uses `browserManager.humanInput`, which is what a call site normally wants.
   */
  humanInput?: HumanInputProvider;
}

/**
 * Creates an instance of an AI provider based on the provider type.
 */
export function createAIProvider(
  type: AIProviderType,
  browserManager: BrowserManager,
  options?: ProviderFactoryOptions
): IAIProvider {
  // The manager owns the factory because it owns the options, so both providers
  // pick up HUMAN_INPUT, HUMAN_TYPING and the pointer tuning from one place.
  const humanInput = options?.humanInput ?? browserManager.humanInput;

  switch (type) {
    case 'gemini':
      return new GeminiPage(browserManager, {
        geminiUrl: options?.geminiUrl,
        tmpDir: options?.tmpDir,
        debugDir: options?.debugDir,
        humanInput,
      });
    case 'chatgpt':
    default:
      return new ChatGPTPage(browserManager, {
        chatgptUrl: options?.chatgptUrl,
        tmpDir: options?.tmpDir,
        debugDir: options?.debugDir,
        humanInput,
      });
  }
}
