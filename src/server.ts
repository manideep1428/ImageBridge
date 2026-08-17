import express, { type Request, type Response } from 'express';
import { runTryOnPipeline } from './jobs/tryon-pipeline.js';
import { CharacterManager } from './character/character-manager.js';
import { ApprovalManager } from './jobs/approval-manager.js';
import { getConfig, type StorageMode } from './config/config.js';
import { BrowserManager } from './browser/browser-manager.js';
import { createAIProvider } from './providers/factory.js';
import { StorageManager, type SaveImageResult } from './storage/storage-manager.js';
import type { AIProviderType } from './providers/types.js';

const config = getConfig();
const PORT = config.port;
const app = express();

const characterManager = new CharacterManager();
const approvalManager = new ApprovalManager();
const storageManager = new StorageManager();

// Middleware
app.use(express.json({ limit: '50mb' }));

// Static route to serve locally saved outputs
app.use('/outputs', express.static(config.outputDir));

// Setup CORS
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (_req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

/**
 * Helper function to handle image generation for a specified provider (ChatGPT or Gemini),
 * saves to configured storage (Local server disk, Bunny CDN, or both), and returns URLs.
 */
async function generateAndUploadImage(
  prompt: string,
  providerType: AIProviderType,
  referenceImage?: string,
  storageModeOverride?: StorageMode
): Promise<{
  jobId: string;
  provider: AIProviderType;
  url: string;
  cdnUrl?: string;
  localUrl?: string;
  localPath?: string;
}> {
  const currentConfig = getConfig();
  const profileDir = providerType === 'gemini' ? currentConfig.geminiProfileDir : currentConfig.chatgptProfileDir;

  console.log(`\n================================================================`);
  console.log(`[Express API] Starting generation with ${providerType.toUpperCase()}`);
  console.log(`Prompt: "${prompt}"`);
  if (referenceImage) {
    console.log(`Reference Image: ${referenceImage}`);
  }
  console.log(`Profile Dir: ${profileDir}`);
  console.log(`Storage Mode: ${storageModeOverride || currentConfig.storageMode}`);
  console.log(`================================================================\n`);

  const browserManager = new BrowserManager({
    profileDir,
    headless: currentConfig.headless,
  });

  try {
    const aiProvider = createAIProvider(providerType, browserManager, {
      chatgptUrl: currentConfig.chatgptUrl,
      geminiUrl: currentConfig.geminiUrl,
      tmpDir: currentConfig.tmpDir,
      debugDir: currentConfig.debugDir,
    });

    await aiProvider.ensureLoggedIn();

    const jobId = `gen_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const extractedImage = await aiProvider.generateImage({
      prompt,
      referenceImage: referenceImage || '',
      jobId,
      timeoutMs: currentConfig.generationTimeoutMs,
    });

    console.log(`[Express API] Image generated! Saving via StorageManager...`);
    const filename = `image-generation/${jobId}.${extractedImage.extension}`;
    const storageResult = await storageManager.saveImage(
      extractedImage.data,
      filename,
      extractedImage.contentType,
      { storageMode: storageModeOverride }
    );

    console.log(`[Express API] Successfully saved! URL: ${storageResult.url}`);

    return {
      jobId,
      provider: providerType,
      url: storageResult.url,
      cdnUrl: storageResult.cdnUrl,
      localUrl: storageResult.localUrl,
      localPath: storageResult.localPath,
    };
  } finally {
    await browserManager.close();
  }
}

// ------------------------------------------------------------------
// Health Check Endpoint
// ------------------------------------------------------------------
app.get(['/', '/health', '/api/health'], (_req: Request, res: Response) => {
  const currentConfig = getConfig();
  res.json({
    status: 'ok',
    service: 'AI Image Generation & Try-On Express API Server',
    timestamp: new Date().toISOString(),
    port: currentConfig.port,
    defaultProvider: currentConfig.aiProvider,
    storageMode: currentConfig.storageMode,
    serverBaseUrl: currentConfig.serverBaseUrl,
    outputDirectory: currentConfig.outputDir,
    supportedProviders: ['chatgpt', 'gemini'],
    endpoints: {
      generateAny: 'POST /api/generate ({ prompt, provider?, image?, storageMode? })',
      generateChatGPT: 'POST /api/generate/chatgpt ({ prompt, image?, storageMode? })',
      generateGemini: 'POST /api/generate/gemini ({ prompt, image?, storageMode? })',
      tryonPipeline: 'POST /api/tryon ({ url, maxImages, publishToInstagram })',
      staticOutputs: `GET  ${currentConfig.serverBaseUrl}/outputs/<path>`,
    },
    pendingApprovalsCount: approvalManager.getPendingApprovals().length,
  });
});

// ------------------------------------------------------------------
// Express POST Endpoint: Generic Image Generation (ChatGPT or Gemini)
// Body: { prompt: string, provider?: 'chatgpt' | 'gemini', image?: string, storageMode?: 'local' | 'bunny' | 'both' }
// Returns: { success: true, jobId, provider, url, cdnUrl?, localUrl?, localPath? }
// ------------------------------------------------------------------
app.post('/api/generate', async (req: Request, res: Response) => {
  try {
    const { prompt, provider, image, storageMode } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Missing required body field: "prompt"' });
    }

    const currentConfig = getConfig();
    const selectedProvider: AIProviderType =
      provider === 'gemini' || provider === 'chatgpt' ? provider : currentConfig.aiProvider;

    const result = await generateAndUploadImage(prompt, selectedProvider, image, storageMode);

    return res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('[API Error /api/generate]:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Image generation failed',
    });
  }
});

// ------------------------------------------------------------------
// Express POST Endpoint: ChatGPT Image Generation
// Body: { prompt: string, image?: string, storageMode?: 'local' | 'bunny' | 'both' }
// Returns: { success: true, jobId, provider: 'chatgpt', url, cdnUrl?, localUrl?, localPath? }
// ------------------------------------------------------------------
app.post('/api/generate/chatgpt', async (req: Request, res: Response) => {
  try {
    const { prompt, image, storageMode } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Missing required body field: "prompt"' });
    }

    const result = await generateAndUploadImage(prompt, 'chatgpt', image, storageMode);

    return res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('[API Error /api/generate/chatgpt]:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'ChatGPT image generation failed',
    });
  }
});

// ------------------------------------------------------------------
// Express POST Endpoint: Gemini Image Generation
// Body: { prompt: string, image?: string, storageMode?: 'local' | 'bunny' | 'both' }
// Returns: { success: true, jobId, provider: 'gemini', url, cdnUrl?, localUrl?, localPath? }
// ------------------------------------------------------------------
app.post('/api/generate/gemini', async (req: Request, res: Response) => {
  try {
    const { prompt, image, storageMode } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Missing required body field: "prompt"' });
    }

    const result = await generateAndUploadImage(prompt, 'gemini', image, storageMode);

    return res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('[API Error /api/generate/gemini]:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Gemini image generation failed',
    });
  }
});

// ------------------------------------------------------------------
// Character Info & Upload Endpoints
// ------------------------------------------------------------------
app.get('/api/character', (_req: Request, res: Response) => {
  return res.json(characterManager.getCharacterInfo());
});

app.post('/api/character/upload', (req: Request, res: Response) => {
  try {
    const { filename = `char_${Date.now()}.jpg`, base64Data } = req.body || {};
    if (!base64Data) {
      return res.status(400).json({ error: 'base64Data is required' });
    }

    const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const savedPath = characterManager.saveCharacterImage(filename, buffer);

    return res.json({
      success: true,
      savedPath,
      character: characterManager.getCharacterInfo(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to upload character photo' });
  }
});

// ------------------------------------------------------------------
// Approval Endpoints
// ------------------------------------------------------------------
app.get('/api/approvals', (_req: Request, res: Response) => {
  return res.json(approvalManager.getPendingApprovals());
});

app.get('/api/approvals/:id', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const approval = approvalManager.getApproval(id);
  if (!approval) {
    return res.status(404).json({ error: `Approval ID "${id}" not found.` });
  }
  return res.json(approval);
});

app.post('/api/approvals/:id/approve', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { caption: editedCaption } = req.body || {};
    console.log(`[Server] Received approval request for ID: ${id}. Edited caption: "${editedCaption || 'none'}"`);

    const approval = await approvalManager.approveAndPublish(id, editedCaption);
    return res.json({
      success: true,
      status: 'PUBLISHED',
      approval,
    });
  } catch (err: any) {
    console.error('[Server Approval Error]', err);
    return res.status(500).json({ error: err.message || 'Failed to approve and publish post' });
  }
});

app.post('/api/approvals/:id/reject', (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const approval = approvalManager.rejectApproval(id);
    return res.json({
      success: true,
      status: 'REJECTED',
      approval,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// ------------------------------------------------------------------
// Virtual Try-On Pipeline Endpoint
// ------------------------------------------------------------------
app.post('/api/tryon', async (req: Request, res: Response) => {
  try {
    const {
      provider,
      url: fashionUrl,
      maxImages = 4,
      publishToInstagram = false,
      requireApproval = true,
      caption,
    } = req.body || {};

    const validatedProvider: AIProviderType | undefined =
      provider === 'gemini' || provider === 'chatgpt' ? provider : undefined;

    console.log(
      `[Server] Received Try-On Request: Provider=${validatedProvider || 'default'}, URL=${fashionUrl || 'local tmp/outfits'}, maxImages=${maxImages}, Instagram=${publishToInstagram}, requireApproval=${requireApproval}`
    );

    const result = await runTryOnPipeline({
      provider: validatedProvider,
      url: fashionUrl,
      maxImages: Number(maxImages) || 4,
      publishToInstagram: Boolean(publishToInstagram),
      requireApproval: Boolean(requireApproval),
      instagramCaption: caption,
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[Server Error]', err);
    return res.status(500).json({ error: err.message || 'Virtual Try-On Pipeline error' });
  }
});

// ------------------------------------------------------------------
// Start Express Server
// ------------------------------------------------------------------
app.listen(PORT, () => {
  const currentConfig = getConfig();
  console.log(`\n================================================================`);
  console.log(`🚀 [AI Image Generation & Virtual Try-On Express Server]`);
  console.log(`Running on http://localhost:${PORT}`);
  console.log(`================================================================`);
  console.log(`  - Default Provider:        ${currentConfig.aiProvider.toUpperCase()}`);
  console.log(`  - Storage Mode:            ${currentConfig.storageMode.toUpperCase()}`);
  console.log(`  - Local Outputs Directory: ${currentConfig.outputDir}`);
  console.log(`  - Health Check:            GET  http://localhost:${PORT}/health`);
  console.log(`  - Static Outputs URL:      GET  http://localhost:${PORT}/outputs/<filename>`);
  console.log(`  - ChatGPT Generation API:  POST http://localhost:${PORT}/api/generate/chatgpt`);
  console.log(`  - Gemini Generation API:   POST http://localhost:${PORT}/api/generate/gemini`);
  console.log(`  - Generic Generation API:  POST http://localhost:${PORT}/api/generate`);
  console.log(`  - Submit Try-On Pipeline:  POST http://localhost:${PORT}/api/tryon`);
  console.log(`  - Pending Approvals:       GET  http://localhost:${PORT}/api/approvals`);
  console.log(`----------------------------------------------------------------`);
  console.log(`⚠️  DISCLAIMER & RESPONSIBLE USE:`);
  console.log(`Use browser sessions responsibly. Excessive automated queries or`);
  console.log(`misuse may violate platform terms of service and risk account ban.`);
  console.log(`================================================================\n`);
});
