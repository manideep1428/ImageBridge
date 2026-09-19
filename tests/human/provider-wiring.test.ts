import test from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import type { BrowserManager } from '../../src/browser/browser-manager.js';
import { createAIProvider } from '../../src/providers/factory.js';
import { HumanInputFactory } from '../../src/human/index.js';

/**
 * A page stand-in that records what was done to it.
 *
 * `handle.evaluate` throws on purpose: it stands in for the real element
 * measuring that the pointer path starts with, so the humanised click cannot
 * complete and the fallback has to carry the interaction. Everything else the
 * human path needs (keyboard events, waitForTimeout) is recorded rather than
 * performed.
 */
function createStubPage() {
  const events: string[] = [];
  const typedCharacters: string[] = [];
  const fills: string[] = [];

  const handle = {
    evaluate: async () => {
      events.push('measure-element');
      throw new Error('no layout engine in a stub');
    },
    dispose: async () => {},
  };

  const locator = {
    first: () => locator,
    waitFor: async () => {},
    isVisible: async () => true,
    isEnabled: async () => true,
    click: async () => {
      events.push('plain-click');
    },
    fill: async (text: string) => {
      fills.push(text);
    },
    elementHandle: async () => handle,
    evaluate: async () => true,
  };

  const page = {
    waitForSelector: async () => {},
    waitForTimeout: async () => {},
    locator: () => locator,
    keyboard: {
      type: async (character: string) => {
        typedCharacters.push(character);
      },
      press: async () => {},
      insertText: async (text: string) => {
        typedCharacters.push(...text);
      },
    },
    isClosed: () => false,
  };

  return { page: page as unknown as Page, events, typedCharacters, fills };
}

function createStubManager(options: { enabled: boolean; typing: boolean }): BrowserManager {
  return {
    humanInput: new HumanInputFactory({
      enabled: options.enabled,
      typing: options.typing,
      visualizeCursor: false,
    }),
  } as unknown as BrowserManager;
}

test('ChatGPT types the prompt key by key through the manager factory', async (t) => {
  t.mock.method(console, 'warn', () => {});

  const { page, events, typedCharacters, fills } = createStubPage();
  const provider = createAIProvider('chatgpt', createStubManager({ enabled: true, typing: true }));

  await provider.composer.enterPrompt(page, 'a cat');

  assert.deepEqual(typedCharacters.join(''), 'a cat', 'each character should be typed');
  assert.ok(events.includes('measure-element'), 'the pointer path should be attempted first');
  assert.ok(events.includes('plain-click'), 'and fall back to a direct click');
  assert.deepEqual(fills, [], 'fill() should not be used while typing is on');
});

test('Gemini types the prompt key by key through the manager factory', async (t) => {
  t.mock.method(console, 'warn', () => {});

  const { page, typedCharacters, fills } = createStubPage();
  const provider = createAIProvider('gemini', createStubManager({ enabled: true, typing: true }));

  await provider.composer.enterPrompt(page, 'a dog');

  assert.deepEqual(typedCharacters.join(''), 'a dog');
  assert.deepEqual(fills, []);
});

test('both providers fall back to a plain click and fill when human input is off', async (t) => {
  t.mock.method(console, 'warn', () => {});

  for (const providerType of ['chatgpt', 'gemini'] as const) {
    const { page, events, typedCharacters, fills } = createStubPage();
    const provider = createAIProvider(
      providerType,
      createStubManager({ enabled: false, typing: false })
    );

    await provider.composer.enterPrompt(page, 'a bird');

    assert.deepEqual(typedCharacters, [], `${providerType} should not type key by key`);
    assert.deepEqual(fills, ['a bird'], `${providerType} should fill the prompt`);
    assert.ok(events.includes('plain-click'), `${providerType} should click directly`);
    // Nothing on the pointer path may run once it is switched off.
    assert.ok(!events.includes('measure-element'), `${providerType} should not measure elements`);
  }
});
