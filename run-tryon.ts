import { runTryOnPipeline } from './src/jobs/tryon-pipeline.js';

// Parse command-line arguments
const args = process.argv.slice(2);

function getArgValue(flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return undefined;
}

const url = getArgValue('--url') || args.find((a) => a.startsWith('http://') || a.startsWith('https://')) || 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=800';
const maxImages = parseInt(getArgValue('--max') || '2', 10);
const publishToInstagram = args.includes('--instagram') || args.includes('-ig');
const caption = getArgValue('--caption') || 'Virtual Try-On Lookbook ✨ #Fashion #AI #OOTD';

console.log('\n================================================================');
console.log('👗 Virtual Try-On Pipeline CLI Runner');
console.log('================================================================');
console.log(`Outfit URL:         ${url}`);
console.log(`Max Images:         ${maxImages}`);
console.log(`Auto-Publish to IG: ${publishToInstagram ? 'ENABLED' : 'DISABLED'}`);
if (publishToInstagram) {
  console.log(`IG Caption:         "${caption}"`);
}
console.log('================================================================\n');

try {
  const result = await runTryOnPipeline({
    url,
    maxImages,
    publishToInstagram,
    instagramCaption: caption,
  });

  console.log('\n================================================================');
  console.log('🎉 PIPELINE COMPLETED SUCCESSFULLY!');
  console.log('================================================================');
  console.log(`Generated Outfits: ${result.results.length}`);
  
  result.results.forEach((item, idx) => {
    console.log(`\n[Look ${idx + 1}]`);
    console.log(`  Source Outfit: ${item.outfitUrl}`);
    console.log(`  Bunny CDN URL: ${item.bunnyCdnUrl}`);
  });

  if (result.instagram) {
    console.log('\n📸 Instagram Publishing:');
    console.log(`  Post Type:    ${result.instagram.postType.toUpperCase()}`);
    console.log(`  Media ID:     ${result.instagram.mediaId}`);
    console.log(`  Container ID: ${result.instagram.containerId}`);
  }

  console.log('================================================================\n');
} catch (err: any) {
  console.error('\n❌ Pipeline Error:', err.message || err);
  process.exit(1);
}
