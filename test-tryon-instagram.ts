import { runTryOnPipeline } from './src/jobs/tryon-pipeline.js';
import { CharacterManager } from './src/character/character-manager.js';
import { buildInitialCharacterPrompt, buildOutfitPrompt } from './prompt.js';

// Parse command line arguments with default target URL
const args = process.argv.slice(2);

function getArgValue(flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return undefined;
}

const targetUrl =
  getArgValue('--url') ||
  getArgValue('--outfits') ||
  args.find((a) => a.startsWith('http://') || a.startsWith('https://')) ||
  './tmp/outfits';

const maxImages = parseInt(getArgValue('--max') || '10', 10);
const publishToInstagram = args.includes('--instagram') || args.includes('-ig');
const caption =
  getArgValue('--caption') ||
  'Virtual Try-On Lookbook Carousel ✨ Generated with AI #Fashion #Lookbook #Style #AI #OOTD';

console.log('\n================================================================');
console.log('👗 AI Virtual Try-On Test: Local Outfits / Carousel Runner');
console.log('================================================================');
console.log(`Outfit Reference Source: ${targetUrl}`);
console.log(`Max Outfits:             ${maxImages}`);
console.log(`Auto-Publish IG Carousel: ${publishToInstagram ? 'ENABLED' : 'DISABLED'}`);

// Display loaded character references
const characterManager = new CharacterManager();
const characterImages = characterManager.getCharacterImages();
console.log(`Character Photos:        ${characterImages.length} found in charcter/`);
characterImages.forEach((img, i) => console.log(`  [${i + 1}] ${img}`));

console.log('\n--- Step 1: Initial Prompt & Character Setup Preview ---');
console.log(
  buildInitialCharacterPrompt({
    characterCount: characterImages.length,
  })
);
console.log('\n--- Step 2: Outfit Prompt Preview ---');
console.log(
  buildOutfitPrompt({
    outfitIndex: 1,
    outfitUrl: targetUrl,
  })
);
console.log('================================================================\n');

try {
  const result = await runTryOnPipeline({
    url: targetUrl,
    maxImages,
    publishToInstagram,
    instagramCaption: caption,
    onProgress: (step, percent) => {
      console.log(`[Progress ${percent ?? 0}%] ${step}`);
    },
  });

  console.log('\n================================================================');
  console.log('🎉 TRY-ON TEST COMPLETED SUCCESSFULLY!');
  console.log('================================================================');
  console.log(`Total Outfits Processed: ${result.totalOutfits}`);

  result.results.forEach((item, idx) => {
    console.log(`\n[Look ${idx + 1}]`);
    console.log(`  Source Outfit: ${item.outfitUrl}`);
    console.log(`  Bunny CDN URL: ${item.bunnyCdnUrl}`);
  });

  if (result.instagram) {
    console.log('\n📸 Instagram Publishing Details:');
    console.log(`  Success:      ${result.instagram.success}`);
    console.log(`  Post Type:    ${result.instagram.postType.toUpperCase()}`);
    console.log(`  Media ID:     ${result.instagram.mediaId}`);
    console.log(`  Container ID: ${result.instagram.containerId}`);
  }

  console.log('\n================================================================\n');
} catch (err: any) {
  console.error('\n❌ Try-On Test Execution Error:', err.message || err);
  process.exit(1);
}
