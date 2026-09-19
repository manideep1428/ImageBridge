import test from 'node:test';
import assert from 'node:assert/strict';
import type { Locator, Page } from 'playwright';
import { HumanMouse } from '../../src/human/mouse.js';
import type { Point } from '../../src/human/pointer.js';

/**
 * A fake page good enough to run the real HumanMouse against.
 *
 * `evaluate` runs the function the pointer code actually ships to the browser,
 * with fake window/document/localStorage in scope, so the clamping, the cursor
 * tracking and the element measuring are all exercised rather than stubbed out.
 * Nothing here emulates rendering: there is no browser in the test environment,
 * so a BrowserManager would have nothing to launch.
 */

interface FakeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

class FakeElement {
  rect: FakeRect;
  scrolledIntoView = 0;
  scrollIntoViewOptions: ScrollIntoViewOptions | null = null;

  constructor(rect: FakeRect) {
    this.rect = rect;
  }

  getBoundingClientRect() {
    const { left, top, width, height } = this.rect;
    return { left, top, width, height, right: left + width, bottom: top + height };
  }

  scrollIntoView(options?: boolean | ScrollIntoViewOptions) {
    this.scrolledIntoView++;
    this.scrollIntoViewOptions = typeof options === 'object' ? options : null;
  }
}

function createFakePage(options: { width?: number; height?: number; rect?: FakeRect } = {}) {
  const width = options.width ?? 1280;
  const height = options.height ?? 800;
  const element = new FakeElement(options.rect ?? { left: 200, top: 300, width: 160, height: 40 });

  const storage = new Map<string, string>();
  const visualCursor: Record<string, any> = { id: '', style: {} };

  const fakeWindow: Record<string, any> = { innerWidth: width, innerHeight: height };

  // Chromium's mousemove is what the in-page tracker listens for, so the fake
  // page has to dispatch it too or the position would never update.
  const mousemoveHandlers: Array<(event: { clientX: number; clientY: number }) => void> = [];

  const fakeDocument: Record<string, any> = {
    documentElement: { clientWidth: width, clientHeight: height },
    body: { appendChild: () => {} },
    getElementById: (id: string) => (id === visualCursor.id ? visualCursor : null),
    createElement: () => {
      visualCursor.id = '';
      visualCursor.style = {};
      return visualCursor;
    },
    addEventListener: (type: string, handler: any) => {
      if (type === 'mousemove') mousemoveHandlers.push(handler);
    },
  };

  const fakeLocalStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  };

  // The tracker reads and writes it through window, not as a bare global.
  fakeWindow.localStorage = fakeLocalStorage;

  /**
   * The pointer code hands these functions to Playwright, so they reference
   * window and document as globals and capture nothing from this module. That is
   * exactly what makes them runnable here: install the fakes as globals, call
   * the real function, then put the globals back.
   */
  const runWithFakeGlobals = <T>(run: () => T): T => {
    const globalScope = globalThis as any;
    const saved = { window: globalScope.window, document: globalScope.document };

    globalScope.window = fakeWindow;
    globalScope.document = fakeDocument;

    try {
      return run();
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete globalScope[key];
        else globalScope[key] = value;
      }
    }
  };

  const evaluate = async (pageFunction: any, arg?: unknown) => {
    const args = arg === undefined ? [] : [arg];

    return runWithFakeGlobals(() => pageFunction(...args));
  };

  const moves: Point[] = [];
  const clicks: { x: number; y: number; delay?: number }[] = [];
  const wheels: { deltaX: number; deltaY: number }[] = [];

  const handle = {
    evaluate: async (elementFunction: any) =>
      runWithFakeGlobals(() => elementFunction(element)),
    dispose: async () => {},
  };

  const locator = {
    elementHandle: async () => handle,
    click: async () => {},
    hover: async () => {},
  };

  const page = {
    evaluate,
    locator: () => locator as unknown as Locator,
    waitForTimeout: async () => {},
    waitForSelector: async () => {},
    addInitScript: async () => {},
    isClosed: () => false,
    mouse: {
      move: async (x: number, y: number) => {
        moves.push({ x, y });

        for (const handler of mousemoveHandlers) {
          handler({ clientX: x, clientY: y });
        }
      },
      click: async (x: number, y: number, clickOptions?: { delay?: number }) => {
        clicks.push({ x, y, delay: clickOptions?.delay });
      },
      wheel: async (deltaX: number, deltaY: number) => {
        wheels.push({ deltaX, deltaY });
      },
    },
  };

  return {
    page: page as unknown as Page,
    element,
    locator: locator as unknown as Locator,
    fakeWindow,
    storage,
    moves,
    clicks,
    wheels,
  };
}

/** Is the point inside the element's middle half, where a click should land? */
function isInsideMiddleHalf(point: Point, rect: FakeRect): boolean {
  return (
    point.x >= rect.left + rect.width * 0.25 &&
    point.x <= rect.left + rect.width * 0.75 &&
    point.y >= rect.top + rect.height * 0.25 &&
    point.y <= rect.top + rect.height * 0.75
  );
}

test('humanLikeClick walks a path to the target instead of teleporting to it', async () => {
  const fake = createFakePage();
  const mouse = new HumanMouse(fake.page);

  await mouse.humanLikeClick(fake.locator);

  assert.ok(fake.moves.length > 5, `expected a path, got ${fake.moves.length} sample(s)`);
  assert.equal(fake.clicks.length, 1, 'the element should be clicked once');

  const click = fake.clicks[0]!;
  assert.ok(
    isInsideMiddleHalf({ x: click.x, y: click.y }, fake.element.rect),
    `click at ${click.x},${click.y} was outside the middle half of the element`
  );

  // The button is held before it is released, the way a person clicks.
  assert.ok(click.delay !== undefined && click.delay >= 200 && click.delay <= 300);
});

test('every sampled point is clamped into the viewport', async () => {
  // A viewport barely bigger than the target, so an unclamped Bezier that
  // overshoots shows up as a coordinate outside the window.
  const fake = createFakePage({
    width: 100,
    height: 80,
    rect: { left: 40, top: 30, width: 40, height: 20 },
  });
  const mouse = new HumanMouse(fake.page);

  await mouse.humanLikeClick(fake.locator);

  for (const move of fake.moves) {
    assert.ok(move.x >= 0 && move.x <= 98, `x ${move.x} left the viewport`);
    assert.ok(move.y >= 0 && move.y <= 78, `y ${move.y} left the viewport`);
  }
});

test('the pointer position is tracked in the page and survives to the next move', async () => {
  const fake = createFakePage();
  const mouse = new HumanMouse(fake.page);

  await mouse.humanLikeClick(fake.locator);

  const last = fake.moves[fake.moves.length - 1]!;

  assert.equal(fake.fakeWindow.cursorX, last.x);
  assert.equal(fake.fakeWindow.cursorY, last.y);
  assert.deepEqual(await mouse.getCurrentMousePosition(), last);

  // Written to storage as well, so a navigation can pick the position back up.
  assert.ok(fake.storage.size > 0, 'the position should be persisted for the next document');
});

test('a second click starts from where the first one ended', async () => {
  const fake = createFakePage();
  const mouse = new HumanMouse(fake.page);

  await mouse.humanLikeClick(fake.locator);
  const endOfFirstMove = fake.moves.length;

  await mouse.humanLikeClick(fake.locator);

  // The first sample of the second move is the last of the first, because the
  // path is computed from the tracked position rather than from a corner.
  assert.deepEqual(fake.moves[endOfFirstMove], fake.moves[endOfFirstMove - 1]);
});

test('an element out of view is scrolled in before the pointer moves to it', async () => {
  const fake = createFakePage({ rect: { left: 200, top: -400, width: 160, height: 40 } });
  const mouse = new HumanMouse(fake.page);

  await mouse.moveToElement(fake.locator);

  assert.equal(fake.element.scrolledIntoView, 1, 'the element should be scrolled exactly once');
  assert.equal(fake.element.scrollIntoViewOptions?.behavior, 'smooth');
});

test('an element already in view is left alone', async () => {
  const fake = createFakePage();
  const mouse = new HumanMouse(fake.page);

  await mouse.moveToElement(fake.locator);

  assert.equal(fake.element.scrolledIntoView, 0, 'a visible element must not re-centre the page');
});

test('a fresh page starts the pointer at the origin, like the Python original', async () => {
  const fake = createFakePage();
  const mouse = new HumanMouse(fake.page);

  assert.deepEqual(await mouse.getCurrentMousePosition(), { x: 0, y: 0 });
});

test('wheel scrolling stops once the wheel budget runs out', async () => {
  const fake = createFakePage({ rect: { left: 200, top: 900, width: 160, height: 40 } });
  const mouse = new HumanMouse(fake.page);

  // The wheel does not actually move anything in a fake page, so the loop spends
  // its whole budget and gives up rather than hanging on an element that never
  // comes into view.
  await mouse.scrollElementIntoView(fake.locator, 3);

  assert.equal(fake.wheels.length, 3, 'the wheel budget should bound the loop');
  assert.ok(fake.wheels.every((wheel) => wheel.deltaY > 0), 'scrolling down is a positive delta');
});

test('wheelScrollToTop does nothing when the page is already at the top', async () => {
  const fake = createFakePage();
  const mouse = new HumanMouse(fake.page);

  await mouse.wheelScrollToTop();

  assert.deepEqual(fake.wheels, []);
});