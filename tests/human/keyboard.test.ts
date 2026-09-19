import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIRST_INTERVAL,
  SECOND_INTERVAL,
  THIRD_INTERVAL,
  FIRST_INTERVAL_PROBABILITY,
  SECOND_INTERVAL_PROBABILITY,
  THIRD_INTERVAL_PROBABILITY,
  sampleTypingInterval,
  sampleTypingDelaySeconds,
} from '../../src/human/keyboard.js';

/** Deterministic replacement for Math.random, so the weights can be counted. */
function mulberry32(seed: number): () => number {
  let a = seed;

  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('the three intervals are the ones mimic_typing.py uses', () => {
  assert.deepEqual(FIRST_INTERVAL, [0.0, 0.1]);
  assert.deepEqual(SECOND_INTERVAL, [0.1, 0.2]);
  assert.deepEqual(THIRD_INTERVAL, [0.2, 0.4]);
});

test('the interval probabilities sum to one', () => {
  const total = FIRST_INTERVAL_PROBABILITY + SECOND_INTERVAL_PROBABILITY + THIRD_INTERVAL_PROBABILITY;

  assert.ok(Math.abs(total - 1) < 1e-9, `total was ${total}`);
  assert.equal(FIRST_INTERVAL_PROBABILITY, 0.377);
  assert.equal(SECOND_INTERVAL_PROBABILITY, 0.5492);
});

test('sampleTypingInterval picks by the cumulative weights', () => {
  assert.deepEqual(sampleTypingInterval(() => 0), FIRST_INTERVAL);
  assert.deepEqual(sampleTypingInterval(() => 0.3769), FIRST_INTERVAL);
  assert.deepEqual(sampleTypingInterval(() => 0.377), SECOND_INTERVAL);
  assert.deepEqual(sampleTypingInterval(() => 0.9261), SECOND_INTERVAL);
  assert.deepEqual(sampleTypingInterval(() => 0.9262), THIRD_INTERVAL);
  assert.deepEqual(sampleTypingInterval(() => 0.999), THIRD_INTERVAL);
});

test('sampleTypingInterval draws each interval with its stated frequency', () => {
  const random = mulberry32(20240919);
  const counts = { first: 0, second: 0, third: 0 };
  const draws = 100000;

  for (let draw = 0; draw < draws; draw++) {
    const interval = sampleTypingInterval(random);

    if (interval === FIRST_INTERVAL) counts.first++;
    else if (interval === SECOND_INTERVAL) counts.second++;
    else counts.third++;
  }

  // Tolerance is generous; the point is that the weights are applied rather
  // than the intervals being chosen uniformly.
  assert.ok(Math.abs(counts.first / draws - 0.377) < 0.01, `first was ${counts.first / draws}`);
  assert.ok(Math.abs(counts.second / draws - 0.5492) < 0.01, `second was ${counts.second / draws}`);
  assert.ok(Math.abs(counts.third / draws - 0.0738) < 0.01, `third was ${counts.third / draws}`);
});

test('sampleTypingDelaySeconds stays inside the interval it drew', () => {
  const random = mulberry32(7);

  for (let draw = 0; draw < 2000; draw++) {
    const delay = sampleTypingDelaySeconds(random);

    assert.ok(delay >= 0 && delay <= 0.4, `delay was ${delay}`);
  }
});

test('sampleTypingDelaySeconds interpolates across the drawn interval', () => {
  // 0.9 selects the second interval, then 0.9 across [0.1, 0.2].
  assert.ok(Math.abs(sampleTypingDelaySeconds(() => 0.9) - 0.19) < 1e-9);
  // 0.99 selects the third interval, then 0.99 across [0.2, 0.4].
  assert.ok(Math.abs(sampleTypingDelaySeconds(() => 0.99) - 0.398) < 1e-9);
  // 0.0 selects the first interval, then 0.0 across [0.0, 0.1].
  assert.equal(sampleTypingDelaySeconds(() => 0), 0);
});
