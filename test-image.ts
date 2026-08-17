import { processJobs } from './src/index.js';
import path from 'node:path';
import fs from 'node:fs';

// 1. Ensure a reference image exists for the test
const sampleImagePath = path.resolve(process.cwd(), 'sample-ref.png');

if (!fs.existsSync(sampleImagePath)) {
  console.log('[Test] Creating a sample reference image at sample-ref.png...');
  // Simple 1x1 PNG pixel buffer
  const samplePngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  fs.writeFileSync(sampleImagePath, samplePngBuffer);
}

// 2. Define the job
const testJobs = [
  {
    id: `job-${Date.now()}`,
    prompt: 'A cute futuristic robot holding a glowing crystal, vibrant colors, 3d render',
    image: sampleImagePath, // Can be a local path or a remote URL (http:// or https://)
  },
];

console.log('\n================================================================');
console.log(`[Test] Starting image generation & Bunny Storage upload test...`);
console.log(`Reference Image: ${sampleImagePath}`);
console.log(`Prompt: "${testJobs[0]!.prompt}"`);
console.log('================================================================\n');

try {
  const result = await processJobs(testJobs);

  console.log('\n================================================================');
  console.log(`[Test Finished] Status: ${result.status.toUpperCase()}`);
  
  for (const jobResult of result.results) {
    if (jobResult.status === 'completed') {
      console.log(`\n SUCCESS!`);
      console.log(`Job ID:   ${jobResult.id}`);
      console.log(`CDN URL:  ${jobResult.url}`);
    } else {
      console.error(`\n FAILED!`);
      console.error(`Job ID:   ${jobResult.id}`);
      console.error(`Error:    ${jobResult.error}`);
    }
  }
  console.log('================================================================\n');
} catch (err) {
  console.error('[Test Error] Fatal error during processing:', err);
}
