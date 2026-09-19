import type { Page } from 'playwright';
import type { Interval } from './pointer.js';

/**
 * Typing rhythm ported from rewards-farmer (`src/mimic_typing.py`).
 *
 * Each key is followed by a pause, and the pause is drawn from one of three
 * intervals with the weights below: mostly quick, sometimes a normal beat, and
 * occasionally the longer hesitation that makes a burst of keystrokes look
 * typed rather than pasted.
 */

export const FIRST_INTERVAL: Interval = [0.0, 0.1];
export const SECOND_INTERVAL: Interval = [0.1, 0.2];
export const THIRD_INTERVAL: Interval = [0.2, 0.4];

export const FIRST_INTERVAL_PROBABILITY = 0.377;
export const SECOND_INTERVAL_PROBABILITY = 0.5492;
export const THIRD_INTERVAL_PROBABILITY =
  1 - (FIRST_INTERVAL_PROBABILITY + SECOND_INTERVAL_PROBABILITY);

/**
 * Which interval the next pause comes from. Takes the random source as an
 * argument so the weights can be tested without running a browser.
 */
export function sampleTypingInterval(random: () => number = Math.random): Interval {
  const roll = random();

  if (roll < FIRST_INTERVAL_PROBABILITY) return FIRST_INTERVAL;
  if (roll < FIRST_INTERVAL_PROBABILITY + SECOND_INTERVAL_PROBABILITY) return SECOND_INTERVAL;
  return THIRD_INTERVAL;
}

/** The pause after one key, in seconds. */
export function sampleTypingDelaySeconds(random: () => number = Math.random): number {
  const [minInterval, maxInterval] = sampleTypingInterval(random);
  return minInterval + random() * (maxInterval - minInterval);
}

/**
 * Sends text one key at a time so the page sees individual keydown, keypress
 * and keyup events with human gaps between them, rather than one insertText.
 */
export class HumanKeyboard {
  private page: Page;
  private typing: boolean;

  constructor(page: Page, typing = true) {
    this.page = page;
    this.typing = typing;
  }

  get enabled(): boolean {
    return this.typing;
  }

  async typeText(text: string): Promise<void> {
    if (!this.typing) {
      await this.page.keyboard.insertText(text);
      return;
    }

    for (const character of text) {
      if (this.page.isClosed()) return;

      try {
        await this.page.keyboard.type(character);
      } catch {
        // Characters with no key mapping on the current layout cannot be
        // pressed; inserting the text keeps the prompt intact.
        await this.page.keyboard.insertText(character);
      }

      await this.page.waitForTimeout(sampleTypingDelaySeconds() * 1000);
    }
  }

  /** A single key with a short pause afterwards, for the Enter fallbacks. */
  async pressKey(key: string): Promise<void> {
    await this.page.keyboard.press(key);
    await this.page.waitForTimeout(sampleTypingDelaySeconds() * 1000);
  }
}
