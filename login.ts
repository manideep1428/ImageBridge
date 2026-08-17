import readline from 'node:readline';
import type { Page } from 'playwright';
import { BrowserManager, type AIProviderType } from './src/index.js';
import { getConfig } from './src/config/config.js';

const config = getConfig();

// Parse CLI flag: --provider gemini or --provider chatgpt
const args = process.argv.slice(2);
function getArgValue(flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return undefined;
}

const providerArg = getArgValue('--provider') || getArgValue('-p');
const selectedProvider: AIProviderType =
  providerArg === 'gemini' || providerArg === 'chatgpt' ? providerArg : config.aiProvider;

const targetUrl = selectedProvider === 'gemini' ? config.geminiUrl : config.chatgptUrl;
const profileDir = selectedProvider === 'gemini' ? config.geminiProfileDir : config.chatgptProfileDir;

/**
 * Accurately checks whether the page is logged into Gemini or ChatGPT.
 * Returns false if on Google Sign-In or landing pages.
 */
async function checkIsLoggedIn(page: Page, provider: AIProviderType): Promise<boolean> {
  const currentUrl = page.url();

  if (provider === 'gemini') {
    // If redirected to Google sign-in page or landing about page, NOT logged in
    if (currentUrl.includes('accounts.google.com') || currentUrl.includes('/about')) {
      return false;
    }
    // Check if Sign-in button exists on page
    const signInBtnCount = await page.locator('a[href*="accounts.google.com"], button:has-text("Sign in"), a:has-text("Sign in")').count();
    if (signInBtnCount > 0) {
      return false;
    }
    // Check if Gemini rich-textarea prompt element exists
    const promptInputCount = await page.locator('rich-textarea, div[aria-label*="prompt" i]').count();
    return promptInputCount > 0;
  } else {
    // ChatGPT
    if (currentUrl.includes('auth.openai.com') || currentUrl.includes('/auth/')) {
      return false;
    }
    const loginBtnCount = await page.locator('button[data-testid="login-button"], a[href*="login"]').count();
    if (loginBtnCount > 0) {
      return false;
    }
    const promptInputCount = await page.locator('#prompt-textarea').count();
    return promptInputCount > 0;
  }
}

console.log('\n================================================================');
console.log(`🔐 Persistent Login Session Setup [${selectedProvider.toUpperCase()}]`);
console.log('================================================================');
console.log(`Provider:          ${selectedProvider.toUpperCase()}`);
console.log(`Target URL:        ${targetUrl}`);
console.log(`Profile Directory: ${profileDir}`);
console.log('Launching visible Google Chrome window...\n');

const browserManager = new BrowserManager({
  profileDir,
  headless: false, // Keep browser visible so user can enter credentials
});

try {
  const page = await browserManager.getPage();
  console.log(`[Login] Navigating to ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  let isLoggedIn = await checkIsLoggedIn(page, selectedProvider);

  if (isLoggedIn) {
    console.log(`\n🎉 [Login] Session already verified! You are logged into ${selectedProvider.toUpperCase()}.`);
  } else {
    console.log('\n================================================================');
    console.log(`👉 ACTION REQUIRED: Chrome browser window is open!`);
    console.log(`👉 Please log into your ${selectedProvider.toUpperCase()} account in Chrome.`);
    console.log('----------------------------------------------------------------');
    console.log(`Chrome will stay open. Waiting for you to complete sign-in...`);
    console.log('(Or press ENTER in this terminal when finished)');
    console.log('================================================================\n');

    let userHitEnter = false;

    // Terminal prompt
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('Press ENTER after you have finished logging in on Chrome: ', () => {
      userHitEnter = true;
      rl.close();
    });

    // Poll every 2 seconds to check if user completed login on screen
    while (!isLoggedIn && !userHitEnter) {
      await page.waitForTimeout(2000);
      try {
        isLoggedIn = await checkIsLoggedIn(page, selectedProvider);
      } catch {
        // Page navigation in progress
      }
    }

    rl.close();
  }

  // Final confirmation check
  isLoggedIn = await checkIsLoggedIn(page, selectedProvider);

  if (isLoggedIn) {
    console.log('\n================================================================');
    console.log(`🎉 SUCCESS! ${selectedProvider.toUpperCase()} LOGIN SESSION SAVED!`);
    console.log('Your session cookies & tokens are permanently saved in:');
    console.log(`📂 ${profileDir}`);
    console.log('You can now run any try-on test or pipeline without logging in again.');
    console.log('================================================================\n');
  } else {
    console.warn(
      `\n⚠️ Session not fully verified. Saved current browser state to ${profileDir}.`
    );
  }
} catch (err: any) {
  console.error('\n❌ Login Error:', err.message || err);
} finally {
  await browserManager.close();
}
