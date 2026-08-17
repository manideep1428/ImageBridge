import path from 'node:path';
import { chromium as vanillaChromium, type BrowserContext, type Page } from 'playwright';
import { addExtra } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Properly initialize playwright-extra stealth plugin
const chromiumStealth = addExtra(vanillaChromium);
chromiumStealth.use(StealthPlugin());

export interface BrowserManagerOptions {
  profileDir: string;
  headless: boolean;
  useRealChrome?: boolean;
}

/**
 * Shared Playwright browser manager with stealth anti-detection for ChatGPT and Gemini.
 * Uses `addExtra(vanillaChromium)` + `StealthPlugin()` to bypass Google Accounts sign-in checks.
 */
export class BrowserManager {
  private options: BrowserManagerOptions;
  private context: BrowserContext | null = null;

  constructor(options: BrowserManagerOptions) {
    this.options = {
      profileDir: path.resolve(options.profileDir),
      headless: options.headless,
      useRealChrome: options.useRealChrome ?? true,
    };
  }

  /**
   * Launches (or returns existing) persistent browser context.
   */
  async getContext(): Promise<BrowserContext> {
    if (this.context) return this.context;

    console.log(
      `[BrowserManager] Launching ${
        this.options.useRealChrome ? 'Real Google Chrome (Stealth Mode)' : 'Chromium (Stealth Mode)'
      } (headless=${this.options.headless}, no-sandbox=true)...`
    );
    console.log(`[BrowserManager] Persistent Profile Directory: ${this.options.profileDir}`);

    const baseArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-zygote',
      '--disable-gpu',
    ];

    const launchOptions: any = {
      headless: this.options.headless,
      viewport: { width: 1440, height: 900 },
      args: baseArgs,
      ignoreDefaultArgs: ['--enable-automation'],
      bypassCSP: true,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    };

    if (this.options.useRealChrome) {
      launchOptions.channel = 'chrome';
    }

    try {
      this.context = (await chromiumStealth.launchPersistentContext(
        this.options.profileDir,
        launchOptions
      )) as unknown as BrowserContext;
    } catch (err: any) {
      console.warn(
        `[BrowserManager] Stealth launch fallback: ${err.message || err}. Launching with vanilla Playwright...`
      );
      delete launchOptions.channel;
      this.context = await vanillaChromium.launchPersistentContext(this.options.profileDir, launchOptions);
    }

    // Apply stealth patches to every new page
    this.context.on('page', async (page) => {
      await this.applyStealthPatches(page);
    });

    console.log('[BrowserManager] Browser context launched successfully with stealth & persistent profile.');
    return this.context;
  }

  /**
   * Returns the first open page or creates a new one.
   */
  async getPage(): Promise<Page> {
    const ctx = await this.getContext();
    const pages = ctx.pages();
    if (pages.length > 0 && pages[0]) {
      return pages[0];
    }
    return await ctx.newPage();
  }

  /**
   * Creates a new page (tab) in the browser context.
   */
  async newPage(): Promise<Page> {
    const ctx = await this.getContext();
    const page = await ctx.newPage();
    await this.applyStealthPatches(page);
    return page;
  }

  /**
   * Closes the browser context and all pages.
   */
  async close(): Promise<void> {
    if (this.context) {
      try {
        await this.context.close();
        console.log('[BrowserManager] Browser context closed.');
      } catch (err) {
        console.warn('[BrowserManager] Error closing browser context:', err);
      }
      this.context = null;
    }
  }

  /**
   * Applies stealth patches to a page to avoid bot detection.
   */
  private async applyStealthPatches(page: Page): Promise<void> {
    try {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });
        (window as any).chrome = {
          runtime: {},
        };
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters: any) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
            : originalQuery(parameters);
      });
    } catch {
      // Best-effort
    }
  }
}
