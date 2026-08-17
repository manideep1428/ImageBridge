import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { JobProcessor } from '../src/jobs/processor.js';
import type { Job, JobResult } from '../src/jobs/types.js';
import type { ImageStorage } from '../src/storage/bunny-storage.js';

describe('JobProcessor Unit Tests', () => {
  const dummyImageDir = path.resolve(process.cwd(), './tmp/test_refs');
  const dummyImagePath = path.join(dummyImageDir, 'test.jpg');

  if (!fs.existsSync(dummyImageDir)) {
    fs.mkdirSync(dummyImageDir, { recursive: true });
  }
  fs.writeFileSync(dummyImagePath, Buffer.from('fake image data'));

  test('validateJobs rejects invalid inputs', () => {
    const mockStorage: ImageStorage = {
      upload: async () => 'https://cdn.example.com/test.png',
    };

    const processor = new JobProcessor({ headless: true }, mockStorage);

    // Empty array
    assert.throws(() => processor.validateJobs([]), /non-empty array/);

    // Missing id
    assert.throws(
      () => processor.validateJobs([{ id: '', prompt: 'test', image: dummyImagePath } as Job]),
      /missing a valid "id"/
    );

    // Missing prompt
    assert.throws(
      () => processor.validateJobs([{ id: '001', prompt: '', image: dummyImagePath } as Job]),
      /missing a valid "prompt"/
    );

    // Missing image
    assert.throws(
      () => processor.validateJobs([{ id: '001', prompt: 'test', image: '' } as Job]),
      /missing a valid "image"/
    );

    // Non-existent image file
    assert.throws(
      () => processor.validateJobs([{ id: '001', prompt: 'test', image: './non_existent_123.jpg' }]),
      /does not exist/
    );

    // Duplicate IDs
    assert.throws(
      () =>
        processor.validateJobs([
          { id: '001', prompt: 'test 1', image: dummyImagePath },
          { id: '001', prompt: 'test 2', image: dummyImagePath },
        ]),
      /Duplicate job ID/
    );
  });

  test('validateJobs accepts valid jobs with local file or HTTP URL', () => {
    const mockStorage: ImageStorage = {
      upload: async () => 'https://cdn.example.com/test.png',
    };

    const processor = new JobProcessor({ headless: true }, mockStorage);

    assert.doesNotThrow(() => {
      processor.validateJobs([
        { id: '001', prompt: 'Prompt 1', image: dummyImagePath },
        { id: '002', prompt: 'Prompt 2', image: 'https://example.com/ref.jpg' },
      ]);
    });
  });

  test('process calls onJobUpdate immediately after each job', async () => {
    const mockStorage: ImageStorage = {
      upload: async (_data, filename) => `https://test-cdn.b-cdn.net/${filename}`,
    };

    const updatedResults: JobResult[] = [];

    const processor = new JobProcessor(
      {
        headless: true,
        maxRetries: 0,
        onJobUpdate: (result) => {
          updatedResults.push(result);
        },
      },
      mockStorage
    );

    // Override internal aiProvider logic for mock testing
    (processor as any).aiProvider = {
      providerName: 'chatgpt',
      ensureLoggedIn: async () => {},
      generateImage: async (opts: { jobId: string }) => {
        if (opts.jobId === '002') {
          throw new Error('Simulated generation error for job 002');
        }
        return {
          data: Buffer.from('fake generated image bytes'),
          contentType: 'image/png',
          extension: 'png',
        };
      },
    };

    const batchJobs: Job[] = [
      { id: '001', prompt: 'Prompt 1', image: dummyImagePath },
      { id: '002', prompt: 'Prompt 2', image: dummyImagePath },
      { id: '003', prompt: 'Prompt 3', image: dummyImagePath },
    ];

    const result = await processor.process(batchJobs);

    assert.strictEqual(result.status, 'failed');
    assert.strictEqual(result.results.length, 3);
    assert.strictEqual(updatedResults.length, 3);

    // Job 001
    assert.strictEqual(result.results[0]!.id, '001');
    assert.strictEqual(result.results[0]!.status, 'completed');
    assert.strictEqual(result.results[0]!.url, 'https://test-cdn.b-cdn.net/image-generation/001.png');

    // Job 002 (Failed isolation)
    assert.strictEqual(result.results[1]!.id, '002');
    assert.strictEqual(result.results[1]!.status, 'failed');
    assert.strictEqual(result.results[1]!.error, 'Simulated generation error for job 002');

    // Job 003
    assert.strictEqual(result.results[2]!.id, '003');
    assert.strictEqual(result.results[2]!.status, 'completed');
    assert.strictEqual(result.results[2]!.url, 'https://test-cdn.b-cdn.net/image-generation/003.png');
  });
});
