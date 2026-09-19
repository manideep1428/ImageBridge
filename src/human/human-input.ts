import type { Locator, Page } from 'playwright';
import { HumanKeyboard } from './keyboard.js';
import { HumanMouse } from './mouse.js';
import {
  resolveHumanInputOptions,
  type HumanInputOptions,
  type HumanInputProvider,
  type IHumanInput,
} from './types.js';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Everything one page needs to be driven the human way: a pointer that travels
 * a Bezier path and a keyboard that types key by key.
 *
 * Every method falls back to the plain Playwright call when human input is off
 * or when the humanised attempt fails, because the path is a nicety while
 * clicking the right element is the actual requirement.
 */
export class HumanInput implements IHumanInput {
  readonly mouse: HumanMouse;
  readonly keyboard: HumanKeyboard;

  private page: Page;
  private options: HumanInputOptions;

  constructor(page: Page, options?: Partial<HumanInputOptions>) {
    this.page = page;
    this.options = resolveHumanInputOptions(options);
    this.mouse = new HumanMouse(page, this.options);
    this.keyboard = new HumanKeyboard(page, this.options.typing);
  }

  get enabled(): boolean {
    return this.options.enabled;
  }

  async click(locator: Locator): Promise<void> {
    if (!this.options.enabled) {
      await locator.click();
      return;
    }

    try {
      await this.mouse.humanLikeClick(locator);
    } catch (error) {
      console.warn(
        `[HumanInput] Human-like click failed (${messageOf(error)}); clicking directly instead.`
      );
      await locator.click();
    }
  }

  async moveTo(locator: Locator): Promise<void> {
    if (!this.options.enabled) {
      await locator.hover();
      return;
    }

    try {
      await this.mouse.moveToElement(locator);
    } catch {
      await locator.hover();
    }
  }

  async typeInto(locator: Locator, text: string): Promise<void> {
    await this.click(locator);

    if (!this.options.typing) {
      await locator.fill(text);
      return;
    }

    await this.keyboard.typeText(text);

    // A field that never took focus swallows every keystroke silently, so check
    // that something landed rather than sending an empty prompt. fill() replaces
    // the content either way, so a field that did type correctly is left alone.
    const landed = await locator
      .evaluate((element) => {
        const field = element as HTMLElement & { value?: string };
        const value = typeof field.value === 'string' ? field.value : '';
        return (value || field.textContent || '').trim().length > 0;
      })
      .catch(() => true);

    if (!landed) {
      console.warn('[HumanInput] Typed text did not land in the field; filling it instead.');
      await locator.fill(text);
    }
  }

  async pressKey(key: string): Promise<void> {
    if (!this.options.typing) {
      await this.page.keyboard.press(key);
      return;
    }

    await this.keyboard.pressKey(key);
  }
}

/**
 * One HumanInput per page, because the pointer position and the installed
 * cursor tracker live in that instance and must carry between interactions.
 */
export class HumanInputFactory implements HumanInputProvider {
  private options: HumanInputOptions;
  private perPage = new WeakMap<Page, IHumanInput>();

  constructor(options?: Partial<HumanInputOptions>) {
    this.options = resolveHumanInputOptions(options);
  }

  forPage(page: Page): IHumanInput {
    let existing = this.perPage.get(page);

    if (!existing) {
      existing = new HumanInput(page, this.options);
      this.perPage.set(page, existing);
    }

    return existing;
  }
}

/**
 * Clicks a locator through the human input when there is one.
 *
 * The visibility and enabled checks are repeated here because the humanised
 * path clicks at coordinates and so skips Playwright's actionability checks:
 * without them a disabled send button would be clicked and the caller would
 * believe the prompt had been submitted.
 */
export async function humanizedClick(
  human: IHumanInput | undefined,
  locator: Locator,
  timeoutMs = 5000
): Promise<void> {
  if (!human) {
    await locator.click();
    return;
  }

  await locator.waitFor({ state: 'visible', timeout: timeoutMs });

  // Playwright's own click waits for a disabled button to become enabled, so
  // this does too: a send button that appears a moment before it is usable is
  // normal, and failing on the first check would press Enter instead and give up
  // on the humanised click for no reason.
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await locator.isEnabled()) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!(await locator.isEnabled())) {
    throw new Error('Element is not enabled yet.');
  }

  await human.click(locator);
}