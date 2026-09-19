import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cubicBezier,
  cubicBezierSingleCoordinate,
  getBezierPath,
  getDistortedBezierPath,
  getFinalPathFromRealTime,
  getFinalPathWithFittsLaw,
  getMovementTimeFromFittsLaw,
  logisticSigmoid,
  chooseTargetInElement,
  distanceBetween,
  randomAnySign,
  randomInt,
  DEFAULT_DEVIATION_INTERVAL,
  DEFAULT_INTERMEDIATE_RADIUS_INTERVAL,
  FITTS_LAW_A,
  FITTS_LAW_B,
  VELOCITY_SIGMOID_SCALE,
  type Point,
} from '../../src/human/pointer.js';

const START: Point = { x: 100, y: 200 };
const END: Point = { x: 900, y: 600 };
const MOVEMENT_TIME = 1;

/** Shortest distance from a point to the segment between a and b. */
function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) return distanceBetween(point, a);

  const projection = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)
  );

  return Math.hypot(point.x - (a.x + projection * dx), point.y - (a.y + projection * dy));
}

test('cubicBezier passes through its endpoints and the midpoint', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 0, y: 0 };
  const p2 = { x: 10, y: 0 };
  const p3 = { x: 10, y: 0 };

  assert.deepEqual(cubicBezier(p0, p1, p2, p3, 0), p0);
  assert.deepEqual(cubicBezier(p0, p1, p2, p3, 1), p3);
  // 3t(1-t)^2 * p2 + t^3 * p3 at t = 0.5 is 3.75 + 1.25.
  assert.equal(cubicBezier(p0, p1, p2, p3, 0.5).x, 5);
});

test('cubicBezierSingleCoordinate is a convex combination of its inputs', () => {
  for (const t of [0, 0.1, 0.37, 0.5, 0.99, 1]) {
    const value = cubicBezierSingleCoordinate(0, 100, 200, 300, t);
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0 && value <= 300);
  }
});

test('getBezierPath starts and ends exactly on the requested points', () => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const path = getBezierPath(START, END);

    assert.deepEqual(path(0), START);
    assert.deepEqual(path(1), END);
  }
});

test('getDistortedBezierPath keeps the endpoints and bounds the wobble', () => {
  const closeTo = (a: Point, b: Point, epsilon = 1e-9) =>
    Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;

  for (let attempt = 0; attempt < 50; attempt++) {
    const path = getDistortedBezierPath(START, END);

    // A zone that covers t = 1 scales its offset by a value that lands a few
    // ulps away from zero, the same as the Python original, so this is a
    // near-equality rather than an exact one.
    assert.ok(closeTo(path(0), START), 'path should start at the start');
    assert.ok(closeTo(path(1), END), 'path should end at the end');
  }
});

test('each distortion zone pulls the path at most the deviation off the line', () => {
  // Zero control radius makes the true path the straight segment, so the only
  // way a sample can leave it is through a distortion offset. The offset is
  // drawn per axis, so the displacement magnitude reaches at most max * sqrt(2).
  const maxDeviation = DEFAULT_DEVIATION_INTERVAL[1] * Math.SQRT2;

  for (let attempt = 0; attempt < 20; attempt++) {
    const path = getDistortedBezierPath(START, END, {
      intermediateRadiusInterval: [0, 0],
      distortionFrequency: 1,
      distortionZoneTimeLength: 0.05,
    });

    for (let step = 0; step <= 100; step++) {
      const point = path(step / 100);

      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(
        distanceToSegment(point, START, END) <= maxDeviation + 1e-9,
        `sample ${step} left the segment by more than ${maxDeviation}`
      );
    }
  }
});

test('a distorted path stays inside the start and end box plus its overshoot', () => {
  // The curve lives in the convex hull of its four control points, so it can
  // only leave the start-to-end box by the control radius plus the deviation.
  // moveMouse relies on this staying small enough to clamp into the viewport.
  const margin =
    DEFAULT_INTERMEDIATE_RADIUS_INTERVAL[1] + DEFAULT_DEVIATION_INTERVAL[1] * Math.SQRT2;

  for (let attempt = 0; attempt < 50; attempt++) {
    const path = getDistortedBezierPath(START, END);

    for (let step = 0; step <= 100; step++) {
      const point = path(step / 100);

      assert.ok(point.x >= Math.min(START.x, END.x) - margin - 1e-6);
      assert.ok(point.x <= Math.max(START.x, END.x) + margin + 1e-6);
      assert.ok(point.y >= Math.min(START.y, END.y) - margin - 1e-6);
      assert.ok(point.y <= Math.max(START.y, END.y) + margin + 1e-6);
    }
  }
});

test('getDistortedBezierPath rejects a zone length that would loop forever', () => {
  assert.throws(() => getDistortedBezierPath(START, END, { distortionZoneTimeLength: 0 }), RangeError);
});

test('logisticSigmoid rises from 0 through the middle and stays inside [-1, 1]', () => {
  assert.equal(logisticSigmoid(0), 0);
  assert.ok(logisticSigmoid(-10) > -1);
  assert.ok(logisticSigmoid(10) < 1);

  let previous = logisticSigmoid(-6);
  for (let x = -5.5; x <= 6; x += 0.5) {
    const current = logisticSigmoid(x);
    assert.ok(current > previous, `sigmoid should increase at x=${x}`);
    previous = current;
  }
});

test('the sigmoid scale stops just short of the target, which the path then completes', () => {
  // The constant is only correct while this holds; changing one means changing
  // the other, which is why it is asserted rather than assumed.
  const progress = logisticSigmoid(VELOCITY_SIGMOID_SCALE);
  assert.ok(progress > 0.97 && progress < 1);
});

test('getFinalPathFromRealTime holds the start before zero and reaches the end at the deadline', () => {
  const path = getFinalPathFromRealTime(MOVEMENT_TIME, START, END);

  assert.deepEqual(path(-1), START);
  assert.deepEqual(path(0), START);
  assert.deepEqual(path(MOVEMENT_TIME / 2), path(MOVEMENT_TIME / 2));
  // Exactly at the deadline, not only past it: the sigmoid is asymptotic, so a
  // sample taken there would otherwise land short of the target.
  assert.deepEqual(path(MOVEMENT_TIME), END);
  assert.deepEqual(path(MOVEMENT_TIME * 5), END);
});

test('getFinalPathFromRealTime stays finite and inside the movement box', () => {
  const path = getFinalPathFromRealTime(MOVEMENT_TIME, START, END);

  for (let step = 0; step <= 100; step++) {
    const point = path((step / 100) * MOVEMENT_TIME);
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    assert.ok(point.x >= START.x - 80 && point.x <= END.x + 80);
    assert.ok(point.y >= START.y - 80 && point.y <= END.y + 80);
  }
});

test('getMovementTimeFromFittsLaw follows the measured model', () => {
  assert.equal(FITTS_LAW_A, 0.55);
  assert.equal(FITTS_LAW_B, 0.1276);

  // ID = log2(2 * 200 / 100) = 2, so MT = 0.55 + 0.1276 * 2.
  assert.ok(Math.abs(getMovementTimeFromFittsLaw(200, 100) - 0.8052) < 1e-9);

  // ID = log2(2 * 1000 / 100) = log2(20).
  const far = getMovementTimeFromFittsLaw(1000, 100);
  assert.ok(Math.abs(far - 1.101478) < 1e-5);
});

test('getMovementTimeFromFittsLaw rises with distance and falls with target width', () => {
  assert.ok(getMovementTimeFromFittsLaw(800, 100) > getMovementTimeFromFittsLaw(200, 100));
  assert.ok(getMovementTimeFromFittsLaw(800, 200) < getMovementTimeFromFittsLaw(800, 100));
});

test('getMovementTimeFromFittsLaw clamps degenerate targets instead of returning NaN', () => {
  for (const [distance, width] of [
    [0, 100],
    [100, 0],
    [0, 0],
    [100, -50],
    [100, 100000],
  ] as const) {
    const movementTime = getMovementTimeFromFittsLaw(distance, width);
    assert.ok(Number.isFinite(movementTime), `finite for D=${distance} W=${width}`);
    assert.ok(movementTime >= 0, `not negative for D=${distance} W=${width}`);
  }
});

test('getFinalPathWithFittsLaw ends on the target for a wide and a narrow target', () => {
  for (const width of [16, 400]) {
    const path = getFinalPathWithFittsLaw(width, START, END);
    assert.deepEqual(path(0), START);
    assert.deepEqual(path(60), END);
  }
});

test('chooseTargetInElement lands in the middle half of the element', () => {
  const box = { x: 300, y: 120, width: 200, height: 80 };

  for (let attempt = 0; attempt < 500; attempt++) {
    const target = chooseTargetInElement(box);

    assert.ok(target.x >= 300 + 50 && target.x <= 300 + 150, `x was ${target.x}`);
    assert.ok(target.y >= 120 + 20 && target.y <= 120 + 60, `y was ${target.y}`);
  }
});

test('chooseTargetInElement survives a target narrower than four pixels', () => {
  const box = { x: 10, y: 10, width: 2, height: 2 };
  const target = chooseTargetInElement(box);

  // The bounds cross on something this small, so the point stays inside the
  // element instead of raising the way Python's randint would.
  assert.ok(Number.isFinite(target.x) && Number.isFinite(target.y));
  assert.ok(target.x >= 10 && target.x <= 12, `x was ${target.x}`);
  assert.ok(target.y >= 10 && target.y <= 12, `y was ${target.y}`);
});

test('distanceBetween is the Euclidean distance', () => {
  assert.equal(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(distanceBetween(START, START), 0);
});

test('randomInt stays inclusive of both bounds', () => {
  for (let attempt = 0; attempt < 500; attempt++) {
    const value = randomInt(5, 7);
    assert.ok(Number.isInteger(value));
    assert.ok(value >= 5 && value <= 7);
  }

  assert.equal(randomInt(4, 4), 4);
  assert.equal(randomInt(9, 2), 9);
});

test('randomAnySign uses both signs of the same magnitude range', () => {
  const seen = new Set<number>();

  for (let attempt = 0; attempt < 500; attempt++) {
    const value = randomAnySign(2, 3);
    assert.ok(Math.abs(value) >= 2 && Math.abs(value) <= 3);
    seen.add(value);
  }

  assert.ok(seen.has(2) && seen.has(3), 'positive side should appear');
  assert.ok(seen.has(-2) && seen.has(-3), 'negative side should appear');
});

test('the default control point radius matches the Python original', () => {
  assert.deepEqual(DEFAULT_INTERMEDIATE_RADIUS_INTERVAL, [20, 40]);
});