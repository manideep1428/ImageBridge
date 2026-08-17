import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config/config.js';
import { type ImageStorage } from '../storage/bunny-storage.js';
import { StorageManager } from '../storage/storage-manager.js';
import { BrowserManager } from '../browser/browser-manager.js';
import { createAIProvider } from '../providers/factory.js';
import type { IAIProvider, AIProviderType } from '../providers/types.js';
import {
  type Job,
  type JobResult,
  type BatchResult,
  type WorkerOptions,
  GlobalWorkerError,
} from './types.js';

export class JobProcessor {
  private options: WorkerOptions;
  private storage: ImageStorage;
  private browserManager: BrowserManager;
  private aiProvider: IAIProvider;

  constructor(options?: WorkerOptions, storageOverride?: ImageStorage) {
    const config = getConfig();
    const provider: AIProviderType = options?.provider || config.aiProvider;

    const defaultProfileDir = provider === 'gemini' ? config.geminiProfileDir : config.chatgptProfileDir;

    this.options = {
      provider,
      profileDir: options?.profileDir || defaultProfileDir,
      headless: options?.headless ?? config.headless,
      maxRetries: options?.maxRetries ?? config.maxRetries,
      generationTimeoutMs: options?.generationTimeoutMs ?? config.generationTimeoutMs,
      bunnyConfig: options?.bunnyConfig,
      onJobUpdate: options?.onJobUpdate,
    };

    this.storage = storageOverride || new StorageManager();

    this.browserManager = new BrowserManager({
      profileDir: this.options.profileDir!,
      headless: this.options.headless!,
    });

    this.aiProvider = createAIProvider(provider, this.browserManager, {
      chatgptUrl: config.chatgptUrl,
      geminiUrl: config.geminiUrl,
      tmpDir: config.tmpDir,
      debugDir: config.debugDir,
    });
  }

  /**
   * Validates the array of jobs before starting worker execution.
   */
  validateJobs(jobs: Job[]): void {
    if (!Array.isArray(jobs) || jobs.length === 0) {
      throw new Error('Input must be a non-empty array of jobs.');
    }

    const ids = new Set<string>();

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      if (!job || typeof job !== 'object') {
        throw new Error(`Job at index ${i} is invalid.`);
      }
      if (!job.id || typeof job.id !== 'string' || !job.id.trim()) {
        throw new Error(`Job at index ${i} is missing a valid "id".`);
      }
      if (ids.has(job.id)) {
        throw new Error(`Duplicate job ID found: "${job.id}". Job IDs must be unique.`);
      }
      ids.add(job.id);

      if (!job.prompt || typeof job.prompt !== 'string' || !job.prompt.trim()) {
        throw new Error(`Job "${job.id}" is missing a valid "prompt".`);
      }
      if (!job.image || typeof job.image !== 'string' || !job.image.trim()) {
        throw new Error(`Job "${job.id}" is missing a valid "image" path or URL.`);
      }

      // If local file path, verify it exists
      if (!job.image.startsWith('http://') && !job.image.startsWith('https://')) {
        const resolvedPath = path.resolve(process.cwd(), job.image);
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`Job "${job.id}" reference image file does not exist at: ${resolvedPath}`);
        }
      }
    }
  }

  /**
   * Processes jobs strictly sequentially one by one.
   */
  async process(jobs: Job[]): Promise<BatchResult> {
    // 1. Validate input first
    this.validateJobs(jobs);

    console.log(`\n================================================================`);
    console.log(`Starting job batch execution (Provider: ${this.aiProvider.providerName.toUpperCase()}). Total jobs: ${jobs.length}`);
    console.log(`================================================================\n`);

    const results: JobResult[] = [];
    let hasFailures = false;

    try {
      // Initialize browser session and check login
      await this.aiProvider.ensureLoggedIn();

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i]!;
        console.log(`\n----------------------------------------------------------------`);
        console.log(`[Job ${i + 1}/${jobs.length}] Starting Job ID: ${job.id}`);
        console.log(`Prompt: "${job.prompt}"`);
        console.log(`Reference Image: ${job.image}`);
        console.log(`----------------------------------------------------------------`);

        const maxAttempts = (this.options.maxRetries ?? 2) + 1;
        let jobSuccess = false;
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            if (attempt > 1) {
              console.log(`[${job.id}] Retry attempt ${attempt - 1}/${this.options.maxRetries}...`);
            }

            console.log(`[${job.id}] Uploading reference image & submitting prompt`);
            const extractedImage = await this.aiProvider.generateImage({
              prompt: job.prompt,
              referenceImage: job.image,
              jobId: job.id,
              timeoutMs: this.options.generationTimeoutMs,
            });

            console.log(`[${job.id}] Image generated successfully. Uploading to Bunny Storage...`);
            const storageFilename = `image-generation/${job.id}.${extractedImage.extension}`;
            const cdnUrl = await this.storage.upload(
              extractedImage.data,
              storageFilename,
              extractedImage.contentType
            );

            console.log(`[${job.id}] Completed successfully! Bunny URL: ${cdnUrl}`);

            const jobResult: JobResult = {
              id: job.id,
              status: 'completed',
              url: cdnUrl,
            };

            results.push(jobResult);
            await this.notifyResult(jobResult, job);
            jobSuccess = true;
            break; // Exit retry loop on success
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.error(`[${job.id}] Attempt ${attempt} failed: ${lastError.message}`);

            if (error instanceof GlobalWorkerError) {
              throw error;
            }
          }
        }

        if (!jobSuccess) {
          hasFailures = true;
          const errorMsg = lastError ? lastError.message : 'Unknown generation failure';
          console.error(`[${job.id}] Job failed after ${maxAttempts} attempt(s). Error: ${errorMsg}`);

          const failedResult: JobResult = {
            id: job.id,
            status: 'failed',
            error: errorMsg,
          };

          results.push(failedResult);
          await this.notifyResult(failedResult, job);
        }
      }
    } catch (globalError) {
      console.error('\n[JobProcessor] Fatal global worker error encountered:', globalError);
      throw globalError;
    } finally {
      // Clean browser shutdown
      await this.browserManager.close();
    }

    const batchStatus = hasFailures ? 'failed' : 'completed';
    console.log(`\n================================================================`);
    console.log(`Batch finished. Overall Status: ${batchStatus.toUpperCase()}`);
    console.log(`Results: ${results.filter(r => r.status === 'completed').length}/${results.length} succeeded.`);
    console.log(`================================================================\n`);

    return {
      status: batchStatus,
      results,
    };
  }

  /**
   * Saves and reports the result immediately after each job finishes.
   */
  private async notifyResult(result: JobResult, job: Job): Promise<void> {
    if (this.options.onJobUpdate) {
      try {
        await this.options.onJobUpdate(result, job);
      } catch (err) {
        console.error(`[JobProcessor] Error in onJobUpdate callback for job ${job.id}:`, err);
      }
    }
  }
}

/**
 * Main worker function exported for application usage.
 */
export async function processJobs(jobs: Job[], options?: WorkerOptions): Promise<BatchResult> {
  const processor = new JobProcessor(options);
  return await processor.process(jobs);
}
