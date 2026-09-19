import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { HumanInput, HumanMouse } from '../../src/human/index.js';
import type { Point } from '../../src/human/pointer.js';

/**
 * Real Chromium, real input events.
 *
 * The fake-page tests prove the maths and the book-keeping, but only a browser
 * can prove that Playwright's `mouse.move` actually despatches the sampled path
 * and that a coordinate click lands on the element it was aimed at.
 *
 * Skipped when the browser binaries are not installed, so `npm test` still
 * passes on a machine that has only run `npm install`:
 *
 *     npx playwright install chromium
 */

const VIEWPORT = { width: 1280, height: 800 };

async function launchOrSkip(t: { skip: (message?: string) => void }): Promise<Browser | null> {
  try {
    return await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  } catch (error) {
    t.skip(
      `Playwright's Chromium is not installed (${error instanceof Error ? error.message : String(error)}); run: npx playwright install chromium`
    );
    return null;
  }
}

/** A page with a button to aim at and a field to type into. */
async function createFixturePage(browser: Browser): Promise<Page> {
  const page = await browser.newPage({ viewport: VIEWPORT });

  await page.setContent(`
    <!doctype html>
    <html>
      <body style="margin:0;font-family:sans-serif">
        <div id="prompt" contenteditable="true" style="position:absolute;left:120px;top:600px;width:600px;height:120px;border:1px solid #888"></div>
        <button id="target" style="position:absolute;left:520px;top:300px;width:180px;height:48px">Send</button>
      </body>
    </html>
  `);

  // Recorded in the page, so what is asserted is what the browser actually saw.
  await page.evaluate(() => {
    const scope = window as unknown as Record<string, unknown>;
    scope.__moves = [];
    scope.__click = null;
    scope.__keys = [];

    document.addEventListener('mousemove', (event) => {
      (scope.__moves as { x: number; y: number }[]).push({ x: event.clientX, y: event.clientY });
    });
    document.addEventListener('mousedown', (event) => {
      scope.__click = { x: event.clientX, y: event.clientY };
    });
    document.addEventListener('keydown', (event) => {
      (scope.__keys as string[]).push((event as KeyboardEvent).key);
    });
  });

  return page;
}

/** Furthest a sampled point sits from the straight line between the endpoints. */
function maxDeviationFromChord(points: Point[]): number {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) return 0;

  let worst = 0;

  for (const point of points) {
    // Perpendicular distance to the line through first and last.
    const distance =
      Math.abs(dy * point.x - dx * point.y + last.x * first.y - last.y * first.x) / length;

    if (distance > worst) worst = distance;
  }

  return worst;
}

test('a real click follows the path and lands inside the target', async (t) => {
  const browser = await launchOrSkip(t);
  if (!browser) return;

  try {
    const page = await createFixturePage(browser);
    const mouse = new HumanMouse(page);

    await mouse.humanLikeClick(page.locator('#target'));

    const observed = await page.evaluate(() => {
      const scope = window as unknown as Record<string, unknown>;
      const moves = scope.__moves as { x: number; y: number }[];
      const click = scope.__click as { x: number; y: number } | null;

      return {
        moves,
        click,
        hit: click
          ? ((document.elementFromPoint(click.x, click.y) as HTMLElement | null)?.id ?? null)
          : null,
        cursorX: scope.cursorX,
        cursorY: scope.cursorY,
      };
    });

    assert.ok(
      observed.moves.length > 20,
      `expected a sampled path, the browser saw ${observed.moves.length} move(s)`
    );

    // A teleport would put every sample on the chord; a Bezier bows away from it.
    assert.ok(
      maxDeviationFromChord(observed.moves) > 0.5,
      'the samples should leave the straight line between the endpoints'
    );

    assert.ok(observed.click, 'the target should have been pressed');
    assert.equal(
      observed.hit,
      'target',
      `the click at ${JSON.stringify(observed.click)} missed the button`
    );

    // The in-page tracker ends on the last sampled point, which is where the
    // next move starts from.
    const lastMove = observed.moves[observed.moves.length - 1]!;
    assert.equal(observed.cursorX, lastMove.x);
    assert.equal(observed.cursorY, lastMove.y);

    await page.close();
  } finally {
    await browser.close();
  }
});

test('typing into a real field sends one key event per character', async (t) => {
  const browser = await launchOrSkip(t);
  if (!browser) return;

  try {
    const page = await createFixturePage(browser);
    const human = new HumanInput(page, { enabled: true, typing: true, visualizeCursor: false });

    await human.typeInto(page.locator('#prompt'), 'draw a fox');

    const observed = await page.evaluate(() => {
      const scope = window as unknown as Record<string, unknown>;

      return {
        text: (document.getElementById('prompt') as HTMLElement).textContent ?? '',
        keys: scope.__keys as string[],
        focused: document.activeElement?.id ?? null,
      };
    });

    assert.equal(observed.text, 'draw a fox', 'the prompt should have been typed in full');
    assert.equal(observed.focused, 'prompt', 'the click before typing should have focused the field');

    // One keydown per character, which a single insertText would not produce.
    const typedKeys = observed.keys.filter((key) => key !== 'Shift');
    assert.deepEqual(typedKeys, 'draw a fox'.split(''));

    await page.close();
  } finally {
    await browser.close();
  }
});

test('the visual cursor is only drawn when it is switched on', async (t) => {
  const browser = await launchOrSkip(t);
  if (!browser) return;

  try {
    const page = await createFixturePage(browser);

    const plain = new HumanMouse(page, { visualizeCursor: false });
    await plain.humanLikeClick(page.locator('#target'));
    assert.equal(await page.evaluate(() => document.getElementById('imagebridge-visual-cursor')), null);

    const watched = new HumanMouse(page, { visualizeCursor: true });
    await watched.humanLikeClick(page.locator('#target'));

    const drawn = await page.evaluate(() => {
      const cursor = document.getElementById('imagebridge-visual-cursor');
      if (!cursor) return null;

      // The dot sits where the pointer stopped and never swallows a real click.
      return {
        left: cursor.style.left,
        top: cursor.style.top,
        pointerEvents: cursor.style.pointerEvents,
      };
    });

    assert.ok(drawn, 'the visual cursor should exist once it is enabled');
    assert.equal(drawn.pointerEvents, 'none');
    assert.match(drawn.left, /px$/);
    assert.match(drawn.top, /px$/);

    await page.close();
  } finally {
    await browser.close();
  }
});