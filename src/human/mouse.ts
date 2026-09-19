import type { Locator, Page } from 'playwright';
import {
  chooseTargetInElement,
  distanceBetween,
  getFinalPathFromRealTime,
  getMovementTimeFromFittsLaw,
  randomInt,
  type Interval,
  type PathOptions,
  type Point,
} from './pointer.js';
import { resolveHumanInputOptions, type HumanInputOptions } from './types.js';

/** How long the pointer is held down before release, in milliseconds. */
export const DEFAULT_CLICK_DELAY_INTERVAL: Interval = [200, 300];

const CURSOR_ELEMENT_ID = 'imagebridge-visual-cursor';
const CURSOR_STORAGE_KEY = 'imageBridgeCursorPosition';

/**
 * Runs inside the page, not in Node: Playwright's mouse API never reports the
 * pointer position back, so the page has to remember it. Free of closure
 * references on purpose, because both addInitScript and evaluate serialize the
 * function source instead of shipping a closure.
 */
function installCursorTracker(storageKey: string): void {
  const scope = window as unknown as Record<string, unknown>;
  if (scope.__imageBridgeCursorTracker) return;
  scope.__imageBridgeCursorTracker = true;

  let x = 0;
  let y = 0;

  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved) as { x?: unknown; y?: unknown };
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        x = parsed.x;
        y = parsed.y;
      }
    }
  } catch {
    // Private modes and partitioned storage both throw on access.
  }

  scope.cursorX = x;
  scope.cursorY = y;

  document.addEventListener('mousemove', (event) => {
    scope.cursorX = event.clientX;
    scope.cursorY = event.clientY;
  });
}

/**
 * The pointer half of rewards-farmer's `MouseUtils`, on top of Playwright.
 *
 * Playwright's `mouse.move` writes to the input pipeline and despatching many
 * of them in sequence is what produces a path; every sampled point is clamped
 * to the viewport first, because a distorted Bezier can overshoot the window
 * edge and Chromium drops coordinates outside it.
 */
export class HumanMouse {
  readonly page: Page;
  private options: HumanInputOptions;
  private fallbackInitPos: Point = { x: 0, y: 0 };
  private trackingInstalled = false;

  constructor(page: Page, options?: Partial<HumanInputOptions>) {
    this.page = page;
    this.options = resolveHumanInputOptions(options);
  }

  /** The path tuning, ready to hand to the pointer functions. */
  private pathOptions(): PathOptions {
    return {
      intermediateRadiusInterval: this.options.intermediateRadiusInterval,
      distortionZoneTimeLength: this.options.distortionZoneTimeLength,
      distortionFrequency: this.options.distortionFrequency,
      deviationInterval: this.options.deviationInterval,
    };
  }

  /**
   * Puts the cursor tracker back into the current document and starts from the
   * last known position. Needed after a navigation, which wipes window state.
   */
  async reinitialize(): Promise<void> {
    await this.installCursorTracker();
    await this.writeCursorPosition(this.fallbackInitPos);

    if (this.options.visualizeCursor) {
      await this.installCursorVisualization();
    }
  }

  /**
   * Installs the tracker in the loaded document and in every document the page
   * loads next, so the position survives navigation without the caller having
   * to remember to reinstall it.
   */
  private async installCursorTracker(): Promise<void> {
    if (!this.trackingInstalled) {
      // addInitScript only runs on documents loaded after this call, which is
      // why the evaluate below is not optional.
      await this.page.addInitScript(installCursorTracker, CURSOR_STORAGE_KEY);
      this.trackingInstalled = true;
    }

    await this.page.evaluate(installCursorTracker, CURSOR_STORAGE_KEY);
  }

  /** Sets the tracked position without moving the real pointer. */
  private async writeCursorPosition(position: Point): Promise<void> {
    await this.page.evaluate(
      (point: { x: number; y: number }) => {
        const scope = window as unknown as Record<string, unknown>;
        scope.cursorX = point.x;
        scope.cursorY = point.y;
      },
      { x: Math.round(position.x), y: Math.round(position.y) }
    );
  }

  /** Remembers the position for the next document the page loads. */
  private async persistCursorPosition(position: Point): Promise<void> {
    try {
      await this.page.evaluate(
        (args: { key: string; point: { x: number; y: number } }) => {
          window.localStorage.setItem(args.key, JSON.stringify(args.point));
        },
        { key: CURSOR_STORAGE_KEY, point: { x: position.x, y: position.y } }
      );
    } catch {
      // Storage can be unavailable or full; the tracker value still holds.
    }
  }

  /**
   * Draws the red dot that makes a visible run show where the pointer is.
   * Playwright has no visible cursor of its own in headless mode.
   */
  private async installCursorVisualization(): Promise<void> {
    await this.page.evaluate((id: string) => {
      if (document.getElementById(id)) return;
      // A document still being built has no body to attach to yet.
      if (!document.body) return;

      const cursor = document.createElement('div');
      cursor.id = id;
      cursor.style.position = 'fixed';
      cursor.style.zIndex = '99999';
      cursor.style.width = '15px';
      cursor.style.height = '15px';
      cursor.style.background = 'red';
      cursor.style.borderRadius = '50%';
      cursor.style.border = '2px solid white';
      cursor.style.pointerEvents = 'none'; // Never blocks a real click.
      cursor.style.top = '0px';
      cursor.style.left = '0px';
      cursor.style.transition = 'all 0.3s ease';

      document.body.appendChild(cursor);
    }, CURSOR_ELEMENT_ID);
  }

  private async moveVisualCursor(position: Point): Promise<void> {
    const draw = (args: { id: string; x: number; y: number }) => {
      const cursor = document.getElementById(args.id);
      if (!cursor) return false;

      cursor.style.left = `${args.x}px`;
      cursor.style.top = `${args.y}px`;
      return true;
    };

    try {
      const drawn = await this.page.evaluate(draw, {
        id: CURSOR_ELEMENT_ID,
        x: position.x,
        y: position.y,
      });

      if (!drawn) {
        // The document was replaced under the move, so reinstall and redraw.
        await this.reinitialize();
        await this.page.evaluate(draw, {
          id: CURSOR_ELEMENT_ID,
          x: position.x,
          y: position.y,
        });
      }
    } catch {
      // A navigation mid-move closes the execution context; the next move
      // reinstalls the cursor through reinitialize().
    }
  }

  /** The last known pointer position, or (0, 0) on a fresh document. */
  async getCurrentMousePosition(): Promise<Point> {
    const position = await this.page.evaluate(() => {
      const scope = window as unknown as Record<string, unknown>;
      return { x: scope.cursorX, y: scope.cursorY };
    });

    const { x, y } = position;

    if (typeof x !== 'number' || typeof y !== 'number' || Number.isNaN(x) || Number.isNaN(y)) {
      // Nothing is tracking this document: put the tracker back and carry on
      // from the last position known in Node.
      await this.reinitialize();
      return { ...this.fallbackInitPos };
    }

    this.fallbackInitPos = { x, y };
    return { x, y };
  }

  /** Keeps a point inside the viewport, which the driver would reject otherwise. */
  private async clampToViewport(position: Point): Promise<Point> {
    const bounds = await this.page.evaluate(() => ({
      maxX: (window.innerWidth || document.documentElement.clientWidth) - 2,
      maxY: (window.innerHeight || document.documentElement.clientHeight) - 2,
    }));

    const maxX = Math.max(0, Math.floor(bounds.maxX));
    const maxY = Math.max(0, Math.floor(bounds.maxY));

    return {
      x: Math.max(0, Math.min(Math.round(position.x), maxX)),
      y: Math.max(0, Math.min(Math.round(position.y), maxY)),
    };
  }

  /** One step of a movement: clamp, move, remember, redraw. */
  private async pointerTo(position: Point, visualize: boolean): Promise<Point> {
    const clamped = await this.clampToViewport(position);

    await this.page.mouse.move(clamped.x, clamped.y);
    this.fallbackInitPos = { ...clamped };

    if (visualize) {
      await this.moveVisualCursor(clamped);
    }

    return clamped;
  }

  /**
   * Samples the path until the movement time has elapsed.
   *
   * The loop is driven by the wall clock rather than by a step count, which is
   * why the sample time is clamped: without that the last sample lands an
   * iteration short of moveTime and the pointer stops short of the target on
   * every move.
   */
  async moveMouse(
    moveTime: number,
    pathFunction: (t: number) => Point,
    visualize: boolean = this.options.visualizeCursor
  ): Promise<void> {
    const durationMs = Math.max(0, moveTime * 1000);
    const startTime = performance.now();
    const endTime = startTime + durationMs;
    let last: Point | null = null;

    while (true) {
      if (this.page.isClosed()) return;

      const currentTime = performance.now();
      const elapsedSeconds = Math.min(currentTime - startTime, durationMs) / 1000;

      last = await this.pointerTo(pathFunction(elapsedSeconds), visualize);

      if (currentTime >= endTime) break;
    }

    if (last) {
      await this.persistCursorPosition(last);
    }
  }

  /**
   * Moves to a random point in the middle half of the element, taking as long
   * as Fitts' law says the movement should.
   *
   * An element below the fold yields a target outside the window, so it is
   * scrolled into view first, and only when it actually is out of view:
   * re-centering visible elements unconditionally is what makes a page jump
   * around between interactions. Smooth scrolling is asynchronous, so the rect
   * is polled until it stops moving before the path is computed.
   */
  async moveToElement(locator: Locator): Promise<Point> {
    const handle = await locator.elementHandle();

    if (!handle) {
      throw new Error('Element disappeared before the pointer could move to it.');
    }

    try {
      const fullyInView = await handle.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
      });

      if (!fullyInView) {
        await handle.evaluate((element) =>
          element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
        );

        let lastRect: string | null = null;

        for (let attempt = 0; attempt < 20; attempt++) {
          await this.page.waitForTimeout(150);

          const rect = await handle.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return `${Math.round(box.top)},${Math.round(box.left)}`;
          });

          if (rect === lastRect) break;
          lastRect = rect;
        }
      }

      const currentPosition = await this.getCurrentMousePosition();

      const box = await handle.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      });

      const target = chooseTargetInElement(box);
      const widthTerm = (box.width + box.height) / 2;
      const movementTime = getMovementTimeFromFittsLaw(
        distanceBetween(currentPosition, target),
        widthTerm
      );

      await this.moveMouse(
        movementTime,
        getFinalPathFromRealTime(movementTime, currentPosition, target, this.pathOptions())
      );

      return target;
    } finally {
      await handle.dispose();
    }
  }

  /** Moves to the element the human way, then clicks inside it. */
  async humanLikeClick(
    locator: Locator,
    delayInterval: Interval = DEFAULT_CLICK_DELAY_INTERVAL
  ): Promise<void> {
    const target = await this.moveToElement(locator);

    await this.page.mouse.click(target.x, target.y, {
      delay: randomInt(delayInterval[0], delayInterval[1]),
    });
  }

  /**
   * Scrolls with simulated wheel input until the element fits the viewport.
   *
   * Steps of varying size with short pauses, the way a person scrolls, instead
   * of one jump. Bounded on purpose: an element taller than the window never
   * fits and must not hang the run, so the caller proceeds with the element as
   * visible as it got.
   */
  async scrollElementIntoView(locator: Locator, maxWheelEvents = 60): Promise<void> {
    const handle = await locator.elementHandle();

    if (!handle) return;

    try {
      for (let event = 0; event < maxWheelEvents; event++) {
        if (this.page.isClosed()) return;

        const rect = await handle.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return {
            top: box.top,
            bottom: box.bottom,
            viewportHeight: window.innerHeight || document.documentElement.clientHeight,
          };
        });

        if (rect.top >= 0 && rect.bottom <= rect.viewportHeight) return;

        // Aim the element at the middle of the viewport, one notch at a time.
        const distance = (rect.top + rect.bottom) / 2 - rect.viewportHeight / 2;
        let step = Math.max(-320, Math.min(320, distance));
        step = Math.trunc(step * (0.6 + Math.random() * 0.4));

        if (Math.abs(step) < 40) {
          step = distance > 0 ? 40 : -40;
        }

        await this.page.mouse.wheel(0, step);
        await this.page.waitForTimeout(40 + Math.random() * 80);
      }
    } finally {
      await handle.dispose();
    }
  }

  /**
   * Scrolls back to the top with simulated wheel input.
   *
   * Reads the actual scroll position instead of unwinding a counted number of
   * steps, because the page height can change while results stream in and a
   * symmetric unwind then lands in the wrong place.
   */
  async wheelScrollToTop(maxWheelEvents = 80): Promise<void> {
    for (let event = 0; event < maxWheelEvents; event++) {
      if (this.page.isClosed()) return;

      const offset = await this.page.evaluate(() => window.scrollY || window.pageYOffset || 0);

      if (offset <= 0) return;

      let step = Math.min(340, Math.trunc(offset));
      step = Math.max(60, Math.trunc(step * (0.6 + Math.random() * 0.4)));

      await this.page.mouse.wheel(0, -step);
      await this.page.waitForTimeout(40 + Math.random() * 80);
    }
  }
}