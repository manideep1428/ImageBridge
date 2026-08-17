import express, { type Request, type Response } from 'express';
import { getConfig, type StorageMode } from './config/config.js';
import { BrowserManager } from './browser/browser-manager.js';
import { createAIProvider } from './providers/factory.js';
import { StorageManager } from './storage/storage-manager.js';
import type { AIProviderType } from './providers/types.js';

const config = getConfig();
const PORT = config.port;
const app = express();

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
 * Handles image generation for a specified provider (ChatGPT or Gemini),
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
    service: 'AI Image Generation Express API Server',
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
      staticOutputs: `GET  ${currentConfig.serverBaseUrl}/outputs/<path>`,
    },
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
// Start Express Server
// ------------------------------------------------------------------
app.listen(PORT, () => {
  const currentConfig = getConfig();
  console.log(`\n================================================================`);
  console.log(`🚀 [AI Image Generation Express REST API Server]`);
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
  console.log(`----------------------------------------------------------------`);
  console.log(`⚠️  DISCLAIMER & RESPONSIBLE USE:`);
  console.log(`Use browser sessions responsibly. Excessive automated queries or`);
  console.log(`misuse may violate platform terms of service and risk account ban.`);
  console.log(`================================================================\n`);
});
