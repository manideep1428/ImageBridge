/**
 * Human-like pointer movement and typing, ported from the rewards-farmer
 * project (`src/mouse_trajectory.py` and `src/mimic_typing.py`) onto Playwright.
 *
 * Providers get their input through BrowserManager, which hands out one
 * HumanInput per page; the maths underneath is in pointer.ts and is pure, so it
 * can be tested without a browser.
 */
export {
  HumanMouse,
  DEFAULT_CLICK_DELAY_INTERVAL,
} from './mouse.js';

export {
  HumanKeyboard,
  sampleTypingInterval,
  sampleTypingDelaySeconds,
  FIRST_INTERVAL,
  SECOND_INTERVAL,
  THIRD_INTERVAL,
  FIRST_INTERVAL_PROBABILITY,
  SECOND_INTERVAL_PROBABILITY,
  THIRD_INTERVAL_PROBABILITY,
} from './keyboard.js';

export { HumanInput, HumanInputFactory, humanizedClick } from './human-input.js';

export {
  cubicBezier,
  cubicBezierSingleCoordinate,
  getBezierPath,
  getDistortedBezierPath,
  getFinalPathFromRealTime,
  getFinalPathWithFittsLaw,
  getMovementTimeFromFittsLaw,
  getPathWithTransformedVelocity,
  logisticSigmoid,
  chooseTargetInElement,
  distanceBetween,
  randomAnySign,
  randomInt,
  DEFAULT_INTERMEDIATE_RADIUS_INTERVAL,
  DEFAULT_DEVIATION_INTERVAL,
  DEFAULT_DISTORTION_ZONE_TIME_LENGTH,
  DEFAULT_DISTORTION_FREQUENCY,
  FITTS_LAW_A,
  FITTS_LAW_B,
  VELOCITY_SIGMOID_SCALE,
} from './pointer.js';

export { DEFAULT_HUMAN_INPUT_OPTIONS, resolveHumanInputOptions } from './types.js';

export type { HumanInputOptions, IHumanInput, HumanInputProvider } from './types.js';
export type { Point, Interval, ElementBox, PathOptions } from './pointer.js';