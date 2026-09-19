import test from 'node:test';
import assert from 'node:assert/strict';
import type { Locator, Page } from 'playwright';
import {
  DEFAULT_HUMAN_INPUT_OPTIONS,
  HumanInput,
  HumanInputFactory,
  humanizedClick,
  resolveHumanInputOptions,
} from '../../src/human/index.js';
import type { IHumanInput } from '../../src/human/index.js';

/** Minimal page stand-in: only the members a given test actually reaches. */
function stubPage(overrides: Record<string, unknown> = {}): Page {
  return { keyboard: { press: async () => {} }, ...overrides } as unknown as Page;
}

test('the defaults turn human input on and the cursor dot off', () => {
  assert.equal(DEFAULT_HUMAN_INPUT_OPTIONS.enabled, true);
  assert.equal(DEFAULT_HUMAN_INPUT_OPTIONS.typing, true);
  assert.equal(DEFAULT_HUMAN_INPUT_OPTIONS.visualizeCursor, false);
  assert.deepEqual(DEFAULT_HUMAN_INPUT_OPTIONS.intermediateRadiusInterval, [20, 40]);
  assert.deepEqual(DEFAULT_HUMAN_INPUT_OPTIONS.deviationInterval, [1, 5]);
});

test('resolveHumanInputOptions fills in only what was left out', () => {
  const resolved = resolveHumanInputOptions({ enabled: false, visualizeCursor: true });

  assert.equal(resolved.enabled, false);
  assert.equal(resolved.visualizeCursor, true);
  assert.equal(resolved.typing, DEFAULT_HUMAN_INPUT_OPTIONS.typing);
  assert.deepEqual(resolved.intermediateRadiusInterval, [20, 40]);

  assert.deepEqual(resolveHumanInputOptions(), DEFAULT_HUMAN_INPUT_OPTIONS);
});

test('HumanInputFactory returns one input per page and keeps them apart', () => {
  const factory = new HumanInputFactory({ enabled: true });
  const firstPage = stubPage();
  const secondPage = stubPage();

  const firstInput = factory.forPage(firstPage);

  assert.equal(factory.forPage(firstPage), firstInput, 'same page should reuse the instance');
  assert.notEqual(factory.forPage(secondPage), firstInput, 'another page needs its own pointer');
  assert.equal(firstInput.enabled, true);
});

test('humanizedClick clicks directly when there is no human input', async () => {
  const calls: string[] = [];
  const locator = {
    click: async () => {
      calls.push('click');
    },
  } as unknown as Locator;

  await humanizedClick(undefined, locator);

  assert.deepEqual(calls, ['click']);
});

test('humanizedClick uses the human input once the element is actionable', async () => {
  const calls: string[] = [];
  const locator = {
    click: async () => {
      calls.push('plain');
    },
    waitFor: async () => {},
    isEnabled: async () => true,
  } as unknown as Locator;
  const human = {
    enabled: true,
    click: async () => {
      calls.push('human');
    },
    moveTo: async () => {},
    typeInto: async () => {},
    pressKey: async () => {},
  } satisfies IHumanInput;

  await humanizedClick(human, locator);

  assert.deepEqual(calls, ['human']);
});

test('humanizedClick refuses a disabled element, which a coordinate click would not', async () => {
  const calls: string[] = [];
  const locator = {
    click: async () => {
      calls.push('plain');
    },
    waitFor: async () => {},
    isEnabled: async () => false,
  } as unknown as Locator;
  const human = {
    enabled: true,
    click: async () => {
      calls.push('human');
    },
    moveTo: async () => {},
    typeInto: async () => {},
    pressKey: async () => {},
  } satisfies IHumanInput;

  // The timeout is short here; the real default gives a button time to enable.
  await assert.rejects(() => humanizedClick(human, locator, 50), /not enabled/);
  assert.deepEqual(calls, []);
});

test('humanizedClick waits for a button to enable before giving up on it', async () => {
  const calls: string[] = [];
  let enabled = false;

  const locator = {
    click: async () => {
      calls.push('plain');
    },
    waitFor: async () => {},
    isEnabled: async () => enabled,
  } as unknown as Locator;
  const human = {
    enabled: true,
    click: async () => {
      calls.push('human');
    },
    moveTo: async () => {},
    typeInto: async () => {},
    pressKey: async () => {},
  } satisfies IHumanInput;

  // Enabled after the first check, as a send button that lights up does.
  setTimeout(() => {
    enabled = true;
  }, 150);

  await humanizedClick(human, locator, 2000);

  assert.deepEqual(calls, ['human']);
});

test('HumanInput falls back to a plain click when the pointer path fails', async (t) => {
  t.mock.method(console, 'warn', () => {});

  const calls: string[] = [];
  const locator = {
    elementHandle: async () => {
      throw new Error('element detached');
    },
    click: async () => {
      calls.push('plain');
    },
  } as unknown as Locator;

  await new HumanInput(stubPage(), { enabled: true }).click(locator);

  assert.deepEqual(calls, ['plain']);
});

test('HumanInput types into the field after focusing it', async () => {
  const calls: string[] = [];
  const locator = {
    elementHandle: async () => null,
    click: async () => {
      calls.push('plain-click');
    },
    fill: async () => {
      calls.push('fill');
    },
  } as unknown as Locator;

  await new HumanInput(stubPage(), { enabled: false, typing: false }).typeInto(locator, 'a prompt');

  assert.deepEqual(calls, ['plain-click', 'fill']);
});

test('HumanInput presses keys through the page when typing is off', async () => {
  const pressed: string[] = [];
  const page = stubPage({
    keyboard: {
      press: async (key: string) => {
        pressed.push(key);
      },
    },
    isClosed: () => false,
  });

  await new HumanInput(page, { enabled: false, typing: false }).pressKey('Enter');

  assert.deepEqual(pressed, ['Enter']);
});
