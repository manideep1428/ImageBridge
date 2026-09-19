import type { Locator, Page } from 'playwright';
import {
  DEFAULT_DEVIATION_INTERVAL,
  DEFAULT_DISTORTION_FREQUENCY,
  DEFAULT_DISTORTION_ZONE_TIME_LENGTH,
  DEFAULT_INTERMEDIATE_RADIUS_INTERVAL,
  type Interval,
} from './pointer.js';

/**
 * How humanised the pointer and keyboard should be.
 *
 * `enabled` covers the pointer: moves follow a Bezier path with a Fitts' law
 * duration and clicks land at a random point inside the target. `typing` sends
 * one key at a time with pauses drawn from the same distribution as
 * rewards-farmer's `src/mimic_typing.py`.
 */
export interface HumanInputOptions {
  enabled: boolean;
  typing: boolean;
  /** Draws a red dot in the page so a visible run shows where the pointer is. */
  visualizeCursor: boolean;
  intermediateRadiusInterval: Interval;
  distortionZoneTimeLength: number;
  distortionFrequency: number;
  deviationInterval: Interval;
}

export const DEFAULT_HUMAN_INPUT_OPTIONS: HumanInputOptions = {
  enabled: true,
  typing: true,
  visualizeCursor: false,
  intermediateRadiusInterval: DEFAULT_INTERMEDIATE_RADIUS_INTERVAL,
  distortionZoneTimeLength: DEFAULT_DISTORTION_ZONE_TIME_LENGTH,
  distortionFrequency: DEFAULT_DISTORTION_FREQUENCY,
  deviationInterval: DEFAULT_DEVIATION_INTERVAL,
};

/** Fills in the defaults for whatever the caller left out. */
export function resolveHumanInputOptions(
  partial?: Partial<HumanInputOptions>
): HumanInputOptions {
  return {
    ...DEFAULT_HUMAN_INPUT_OPTIONS,
    ...(partial ?? {}),
  };
}

/**
 * What a provider's sub-modules use to interact with a page. One instance per
 * page, so the pointer position carries from one interaction to the next.
 */
export interface IHumanInput {
  readonly enabled: boolean;

  /** Moves to the element and clicks inside it. */
  click(locator: Locator): Promise<void>;

  /** Moves to the element without clicking. */
  moveTo(locator: Locator): Promise<void>;

  /** Clicks the element to focus it, then enters the text key by key. */
  typeInto(locator: Locator, text: string): Promise<void>;

  /** Presses a single key, for the Enter fallbacks. */
  pressKey(key: string): Promise<void>;
}

/**
 * Hands out the human input for a page. Implemented by BrowserManager so that
 * providers, which only receive the manager, can humanise their own clicks.
 */
export interface HumanInputProvider {
  forPage(page: Page): IHumanInput;
}
