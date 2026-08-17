import type { BunnyStorageConfig } from '../storage/bunny-storage.js';
import type { AIProviderType } from '../providers/types.js';

export interface Job {
  id: string;
  prompt: string;
  image: string;
}

export type JobStatus = 'pending' | 'generating' | 'uploading' | 'completed' | 'failed';

export interface JobResult {
  id: string;
  status: 'completed' | 'failed';
  url?: string;
  error?: string;
}

export interface BatchResult {
  status: 'completed' | 'failed';
  results: JobResult[];
}

export interface WorkerOptions {
  provider?: AIProviderType;
  profileDir?: string;
  headless?: boolean;
  maxRetries?: number;
  generationTimeoutMs?: number;
  bunnyConfig?: Partial<BunnyStorageConfig>;
  onJobUpdate?: (result: JobResult, job: Job) => Promise<void> | void;
}

/**
  Fatal global errors that cause the worker batch processing to halt
 */
export class GlobalWorkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GlobalWorkerError';
  }
}

export class GenerationTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenerationTimeoutError';
  }
}
