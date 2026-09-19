/**
 * Pointer equations ported from rewards-farmer (`src/mouse_trajectory.py`).
 *
 * A move is a cubic Bezier from the current pointer position to the target,
 * with randomly placed distortion zones that pull the path off the curve and
 * a logistic sigmoid that reshapes time so the pointer accelerates away and
 * decelerates into the target. How long the move takes comes from Fitts' law,
 * using the constants measured by rewards-farmer's `src/fitts_law.py`.
 *
 * Pure functions only, no browser, so the maths can be tested on its own.
 */

export type Point = { x: number; y: number };

export type Interval = readonly [number, number];

/** Bounding box of an element, as returned by getBoundingClientRect(). */
export interface ElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_INTERMEDIATE_RADIUS_INTERVAL: Interval = [20, 40];
export const DEFAULT_DEVIATION_INTERVAL: Interval = [1, 5];
export const DEFAULT_DISTORTION_ZONE_TIME_LENGTH = 0.05;
export const DEFAULT_DISTORTION_FREQUENCY = 0.15;

// Measured from repeated click trials: MT = a + b * ID, where ID = log2(2D / W)
// and W = (height + width) / 2. Shorter moves and wider targets take less time.
export const FITTS_LAW_A = 0.55;
export const FITTS_LAW_B = 0.1276;

/**
 * Scales normalized time just enough for the sigmoid to almost reach 1 without
 * changing the shape of the velocity profile. logisticSigmoid(4.5) is 0.978,
 * not 1, so the Bezier is never evaluated at its endpoint;
 * getFinalPathFromRealTime returns the exact target once the move is over.
 * The two values belong together: changing one means revisiting the other.
 */
export const VELOCITY_SIGMOID_SCALE = 4.5;

/** Optional tuning shared by every path builder. */
export interface PathOptions {
  /** How far the control points may sit from the endpoints, in pixels. */
  intermediateRadiusInterval?: Interval;
  /** Length of one distortion zone, as a fraction of the whole move. */
  distortionZoneTimeLength?: number;
  /** Probability that any one zone distorts. */
  distortionFrequency?: number;
  /** How far a distortion zone may pull the path, in pixels. */
  deviationInterval?: Interval;
}

/** Integer in [min, max], both ends included, matching Python's random.randint. */
export function randomInt(min: number, max: number): number {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  if (high <= low) return low;
  return low + Math.floor(Math.random() * (high - low + 1));
}

/**
 * A random magnitude in [min, max] with a random sign, the way a hand overshoots
 * to either side rather than always to the same one.
 */
export function randomAnySign(min: number, max: number): number {
  const magnitude = randomInt(min, max);
  return Math.random() < 0.5 ? -magnitude : magnitude;
}

/** One coordinate of a cubic Bezier at t, with t in [0, 1]. */
export function cubicBezierSingleCoordinate(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number
): number {
  const inverseT = 1 - t;

  const firstCoefficient = inverseT ** 3;
  const secondCoefficient = 3 * t * inverseT ** 2;
  const thirdCoefficient = 3 * inverseT * t ** 2;
  const fourthCoefficient = t ** 3;

  return (
    firstCoefficient * p0 +
    secondCoefficient * p1 +
    thirdCoefficient * p2 +
    fourthCoefficient * p3
  );
}

/** Both coordinates of a cubic Bezier at t, with t in [0, 1]. */
export function cubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  return {
    x: cubicBezierSingleCoordinate(p0.x, p1.x, p2.x, p3.x, t),
    y: cubicBezierSingleCoordinate(p0.y, p1.y, p2.y, p3.y, t),
  };
}

/**
 * A cubic Bezier from start to end whose control points are offset from the
 * endpoints by a random amount, which is what makes every path a different
 * curve instead of a straight line with a fixed bow.
 */
export function getBezierPath(
  start: Point,
  end: Point,
  intermediateRadiusInterval: Interval = DEFAULT_INTERMEDIATE_RADIUS_INTERVAL
): (t: number) => Point {
  const [minRadius, maxRadius] = intermediateRadiusInterval;

  const control1: Point = {
    x: start.x + randomAnySign(minRadius, maxRadius),
    y: start.y + randomAnySign(minRadius, maxRadius),
  };

  const control2: Point = {
    x: end.x + randomAnySign(minRadius, maxRadius),
    y: end.y + randomAnySign(minRadius, maxRadius),
  };

  return (t: number) => cubicBezier(start, control1, control2, end, t);
}

/**
 * A Bezier path with distortion zones sprinkled along it. Inside a zone the
 * path slides away from the curve by a random offset and slides back, which is
 * the small wobble a hand adds to a fast movement.
 */
export function getDistortedBezierPath(
  start: Point,
  end: Point,
  options: PathOptions = {}
): (t: number) => Point {
  const intermediateRadiusInterval =
    options.intermediateRadiusInterval ?? DEFAULT_INTERMEDIATE_RADIUS_INTERVAL;
  const distortionZoneTimeLength =
    options.distortionZoneTimeLength ?? DEFAULT_DISTORTION_ZONE_TIME_LENGTH;
  const distortionFrequency = options.distortionFrequency ?? DEFAULT_DISTORTION_FREQUENCY;
  const deviationInterval = options.deviationInterval ?? DEFAULT_DEVIATION_INTERVAL;

  if (!(distortionZoneTimeLength > 0)) {
    throw new RangeError('distortionZoneTimeLength must be greater than zero.');
  }

  // A zone length above 1 yields no zones at all, which silently turns the
  // wobble off; the Python original behaves the same way.
  const zoneCount = Math.floor(1 / distortionZoneTimeLength);

  const distortionZones: { start: number; end: number }[] = [];
  for (let i = 0; i < zoneCount; i++) {
    if (Math.random() < distortionFrequency) {
      distortionZones.push({
        start: i * distortionZoneTimeLength,
        end: (i + 1) * distortionZoneTimeLength,
      });
    }
  }

  const distortionOffsets: Point[] = distortionZones.map(() => ({
    x: randomAnySign(deviationInterval[0], deviationInterval[1]),
    y: randomAnySign(deviationInterval[0], deviationInterval[1]),
  }));

  const bezierPath = getBezierPath(start, end, intermediateRadiusInterval);

  return (t: number): Point => {
    const truePoint = bezierPath(t);

    for (let i = 0; i < distortionZones.length; i++) {
      const zone = distortionZones[i]!;
      const offset = distortionOffsets[i]!;

      if (t >= zone.start && t <= zone.end) {
        const zoneLength = zone.end - zone.start;
        const zoneProgress = (t - zone.start) / zoneLength;

        if (zoneProgress < 0.5) {
          // Moving from the true point out to the distorted one.
          return {
            x: truePoint.x + offset.x * zoneProgress * 2,
            y: truePoint.y + offset.y * zoneProgress * 2,
          };
        }

        // And back from the distorted point to the true one.
        return {
          x: truePoint.x + offset.x * (1 - (zoneProgress - 0.5) * 2),
          y: truePoint.y + offset.y * (1 - (zoneProgress - 0.5) * 2),
        };
      }
    }

    // Not in a distortion zone, so the point on the curve is the point.
    return truePoint;
  };
}

/**
 * Logistic sigmoid over [-1, 1]: slow at both ends, fast in the middle, which
 * is the velocity profile of a quick aimed movement.
 */
export function logisticSigmoid(x: number): number {
  return 2 / (1 + Math.exp(-x)) - 1;
}

/** A distorted Bezier path evaluated through the sigmoid, so t is time-like. */
export function getPathWithTransformedVelocity(
  start: Point,
  end: Point,
  options: PathOptions = {}
): (t: number) => Point {
  const bezierPath = getDistortedBezierPath(start, end, options);

  return (t: number) => bezierPath(logisticSigmoid(t));
}

/**
 * A path whose argument is real elapsed time in seconds rather than progress.
 *
 * The sigmoid is asymptotic, so a sample taken exactly at movementTime still
 * lands short of the target; the move ends at the target instead.
 */
export function getFinalPathFromRealTime(
  movementTime: number,
  start: Point,
  end: Point,
  options: PathOptions = {}
): (t: number) => Point {
  const path = getPathWithTransformedVelocity(start, end, options);

  return (t: number): Point => {
    if (t < 0) return start;
    if (t >= movementTime) return end;

    return path((t / movementTime) * VELOCITY_SIGMOID_SCALE);
  };
}

/**
 * Fitts' law: how long a movement to a target should take.
 *
 * D is the distance to the target and W is the target's average width and
 * height. Both are clamped away from zero because a zero-width or
 * zero-distance target makes the index of difficulty infinite or negative,
 * which yields either a move that never finishes or one that never starts.
 */
export function getMovementTimeFromFittsLaw(distance: number, targetWidth: number): number {
  const safeWidth = targetWidth > 0 ? targetWidth : 1;
  const safeDistance = distance > 0 ? distance : 1;

  const indexOfDifficulty = Math.log2((2.0 * safeDistance) / safeWidth);
  const movementTime = FITTS_LAW_A + FITTS_LAW_B * indexOfDifficulty;

  return Math.max(0, movementTime);
}

/** A path to a target whose duration comes from Fitts' law. */
export function getFinalPathWithFittsLaw(
  targetWidth: number,
  start: Point,
  end: Point,
  options: PathOptions = {}
): (t: number) => Point {
  const distance = distanceBetween(start, end);
  const movementTime = getMovementTimeFromFittsLaw(distance, targetWidth);

  return getFinalPathFromRealTime(movementTime, start, end, options);
}

/** Euclidean distance between two points. */
export function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * A random point in the middle half of an element: where a person aims, rather
 * than the exact center on every single click.
 */
export function chooseTargetInElement(box: ElementBox): Point {
  const leftBound = Math.floor(box.x + box.width * 0.25);
  const rightBound = Math.floor(box.x + box.width * 0.75);
  const topBound = Math.floor(box.y + box.height * 0.25);
  const bottomBound = Math.floor(box.y + box.height * 0.75);

  return {
    // The Math.max guards a target narrower than four pixels, where the bounds
    // cross and Python's randint would raise instead.
    x: randomInt(leftBound, Math.max(leftBound, rightBound)),
    y: randomInt(topBound, Math.max(topBound, bottomBound)),
  };
}
