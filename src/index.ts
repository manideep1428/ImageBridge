export { processJobs, JobProcessor } from './jobs/processor.js';
export type { Job, JobResult, BatchResult, WorkerOptions, JobStatus } from './jobs/types.js';
export { GlobalWorkerError, GenerationTimeoutError } from './jobs/types.js';

export { BunnyStorage } from './storage/bunny-storage.js';
export type { ImageStorage, BunnyStorageConfig } from './storage/bunny-storage.js';

export { LocalStorage } from './storage/local-storage.js';
export type { LocalStorageConfig } from './storage/local-storage.js';

export { StorageManager } from './storage/storage-manager.js';
export type { SaveImageResult, SaveImageOptions } from './storage/storage-manager.js';

export { BrowserManager } from './browser/browser-manager.js';

export {
  HumanInput,
  HumanInputFactory,
  HumanMouse,
  HumanKeyboard,
  humanizedClick,
  resolveHumanInputOptions,
  DEFAULT_HUMAN_INPUT_OPTIONS,
} from './human/index.js';
export type { HumanInputOptions, IHumanInput, HumanInputProvider } from './human/index.js';

export { ChatGPTPage } from './chatgpt/chatgpt-page.js';
export { ChatGPTComposer } from './chatgpt/composer.js';
export { ChatGPTImageUpload } from './chatgpt/image-upload.js';
export { ChatGPTGenerationDetector } from './chatgpt/generation.js';
export { ChatGPTImageResult } from './chatgpt/image-result.js';

export { GeminiPage } from './gemini/gemini-page.js';
export { GeminiComposer } from './gemini/composer.js';
export { GeminiImageUpload } from './gemini/image-upload.js';
export { GeminiGenerationDetector } from './gemini/generation.js';
export { GeminiImageResult } from './gemini/image-result.js';

export { createAIProvider } from './providers/factory.js';
export type { IAIProvider, AIProviderType, GeneratedImage, GenerateImageOptions } from './providers/types.js';

export { getConfig, validateBunnyConfig } from './config/config.js';
export type { AppConfig, StorageMode } from './config/config.js';
