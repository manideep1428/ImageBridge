import { CharacterManager } from '../character/character-manager.js';
import { UrlOutfitExtractor } from '../extractor/url-extractor.js';
import { StorageManager, type SaveImageResult } from '../storage/storage-manager.js';
import { BrowserManager } from '../browser/browser-manager.js';
import { createAIProvider } from '../providers/factory.js';
import type { AIProviderType } from '../providers/types.js';
import { InstagramPublisher, type InstagramPublishResult } from '../instagram/publisher.js';
import { ApprovalManager, type PendingApproval } from './approval-manager.js';
import { buildInitialCharacterPrompt, buildOutfitPrompt } from '../prompt/default-prompt.js';
import { getConfig } from '../config/config.js';

export interface TryOnPipelineOptions {
  provider?: AIProviderType;
  url?: string;
  maxImages?: number;
  publishToInstagram?: boolean;
  requireApproval?: boolean;
  instagramCaption?: string;
  characterDir?: string;
  onProgress?: (step: string, percent?: number) => void;
}

export interface TryOnResultItem {
  outfitIndex: number;
  outfitUrl: string;
  url: string;
  bunnyCdnUrl?: string;
  localUrl?: string;
  localPath?: string;
}

export interface TryOnPipelineResult {
  success: boolean;
  provider: AIProviderType;
  totalOutfits: number;
  results: TryOnResultItem[];
  instagram: InstagramPublishResult | null;
  approval: PendingApproval | null;
  error?: string;
}

export async function runTryOnPipeline(options: TryOnPipelineOptions): Promise<TryOnPipelineResult> {
  const {
    url,
    maxImages = 4,
    publishToInstagram = false,
    requireApproval = true,
    instagramCaption,
    characterDir,
    onProgress,
  } = options;

  const config = getConfig();
  const selectedProvider: AIProviderType = options.provider || config.aiProvider;

  const characterManager = new CharacterManager(characterDir);
  const extractor = new UrlOutfitExtractor();
  const storage = new StorageManager();
  const igPublisher = new InstagramPublisher();
  const approvalManager = new ApprovalManager();

  onProgress?.('Resolving outfit reference images...', 10);

  // 1. Extract/load outfit images from local directory/file or URL
  const outfitTarget = url || './tmp/outfits';
  const outfit = await extractor.extractFromUrl(outfitTarget, maxImages);
  if (outfit.localImagePaths.length === 0) {
    throw new Error(`No outfit images could be loaded from: ${outfitTarget}`);
  }

  console.log(`[TryOnPipeline] Resolved ${outfit.localImagePaths.length} outfit image(s) from target: ${outfitTarget}`);

  // 2. Load character reference photos
  const characterImages = characterManager.getCharacterImages();
  console.log(`[TryOnPipeline] Loaded ${characterImages.length} character reference photo(s).`);

  if (characterImages.length === 0) {
    console.warn('[TryOnPipeline] Warning: No character reference photos found in character directory.');
  }

  onProgress?.(`Initializing browser session with provider [${selectedProvider.toUpperCase()}]...`, 25);

  const profileDir = selectedProvider === 'gemini' ? config.geminiProfileDir : config.chatgptProfileDir;

  const browserManager = new BrowserManager({
    profileDir,
    headless: config.headless,
  });

  const aiProvider = createAIProvider(selectedProvider, browserManager, {
    chatgptUrl: config.chatgptUrl,
    geminiUrl: config.geminiUrl,
    tmpDir: config.tmpDir,
    debugDir: config.debugDir,
  });

  const results: TryOnResultItem[] = [];

  try {
    await aiProvider.ensureLoggedIn();

    // Start a fresh chat session for this pipeline run
    const page = await aiProvider.newChat();

    // Step 1: Attach character photos and send prompt ONCE
    onProgress?.('Sending character reference photos and initial instructions...', 35);
    console.log('\n================================================================');
    console.log(`[TryOnPipeline] Step 1: Sending System Prompt & Character Photos (Provider: ${selectedProvider})`);
    console.log('================================================================');

    if (characterImages.length > 0) {
      await aiProvider.imageUpload.attachReferenceImages(page, characterImages);
    }

    const initialPrompt = buildInitialCharacterPrompt({
      characterCount: characterImages.length > 0 ? characterImages.length : 1,
    });

    console.log('[TryOnPipeline] Sending Prompt 1:');
    console.log(initialPrompt);
    console.log('----------------------------------------------------------------\n');

    await aiProvider.composer.enterPrompt(page, initialPrompt);
    await aiProvider.composer.submit(page);

    // Wait for text response
    await aiProvider.generationDetector.waitForTextResponse(page, 'character_setup');

    // Step 2: Loop over each extracted outfit image and paste in the same chat
    for (let i = 0; i < outfit.localImagePaths.length; i++) {
      const outfitLocalPath = outfit.localImagePaths[i]!;
      const outfitUrl = outfit.imageUrls[i] || outfitTarget;
      const jobId = `tryon_${Date.now()}_${i + 1}`;
      const progressPercent = Math.round(40 + ((i + 1) / outfit.localImagePaths.length) * 45);

      onProgress?.(`Generating look ${i + 1}/${outfit.localImagePaths.length}...`, progressPercent);
      console.log(`\n================================================================`);
      console.log(`[TryOnPipeline] Step 2: Pasting Outfit ${i + 1}/${outfit.localImagePaths.length}: ${outfitLocalPath}`);
      console.log(`================================================================`);

      const existingImages = await aiProvider.imageResult.getExistingImageUrls(page);

      // Attach extracted outfit reference image
      await aiProvider.imageUpload.attachReferenceImage(page, outfitLocalPath);

      const outfitPrompt = buildOutfitPrompt({
        outfitIndex: i + 1,
        outfitUrl,
      });

      await aiProvider.composer.enterPrompt(page, outfitPrompt);
      await aiProvider.composer.submit(page);

      await aiProvider.generationDetector.waitForGeneration(
        page,
        jobId,
        existingImages,
        config.generationTimeoutMs
      );

      const generatedImage = await aiProvider.imageResult.extractGeneratedImage(page, existingImages);

      const filename = `tryon/${jobId}.${generatedImage.extension}`;
      const savedStorage = await storage.saveImage(
        generatedImage.data,
        filename,
        generatedImage.contentType
      );

      console.log(`[TryOnPipeline] Look ${i + 1} generated & saved: ${savedStorage.url}`);
      results.push({
        outfitIndex: i + 1,
        outfitUrl,
        url: savedStorage.url,
        bunnyCdnUrl: savedStorage.cdnUrl,
        localUrl: savedStorage.localUrl,
        localPath: savedStorage.localPath,
      });
    }
  } finally {
    await browserManager.close();
  }

  // 3. Instagram Publishing & Approval Handling
  let instagramResult: InstagramPublishResult | null = null;
  let approvalResult: PendingApproval | null = null;

  if (publishToInstagram && results.length > 0) {
    const postUrls = results.map((r) => r.bunnyCdnUrl || r.url);
    const defaultCaption = instagramCaption || 'Virtual Try-On Lookbook Carousel ✨ #Fashion #AI #OOTD';

    if (requireApproval) {
      onProgress?.('Sending approval notification to mobile app...', 90);
      console.log(`[TryOnPipeline] Approval required. Creating pending approval notification...`);

      approvalResult = approvalManager.createPendingApproval({
        jobId: `job_${Date.now()}`,
        outfitUrl: outfitTarget,
        generatedImages: postUrls,
        caption: defaultCaption,
      });
    } else {
      onProgress?.('Publishing directly to Instagram...', 90);
      console.log(`[TryOnPipeline] Direct publishing enabled. Posting ${postUrls.length} image(s) to Instagram...`);

      instagramResult = await igPublisher.publish({
        imageUrls: postUrls,
        caption: defaultCaption,
      });
    }
  }

  onProgress?.('Complete!', 100);

  return {
    success: true,
    provider: selectedProvider,
    totalOutfits: results.length,
    results,
    instagram: instagramResult,
    approval: approvalResult,
  };
}
