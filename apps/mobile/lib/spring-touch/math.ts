// Spring Touch math: pure, testable spring and rubber-band helpers.
//
// Original implementation written for the Multica mobile app. It models
// damped harmonic motion (a value with mass that accelerates toward a
// target, overshoots a little, and settles) and progressive resistance
// past a scroll edge with a hard ceiling. No platform code lives here,
// so this module runs under plain Node and is covered by math.test.ts.
//
// Nothing here is copied from another vendor's implementation: the
// integrator is the standard damped-spring equation, written out
// explicitly, and the rubber-band curve is the standard hyperbolic
// resistance form. Tune the presets by feel on a real phone; faster
// is usually better than slower.

/** Stiffness, damping, and mass of one spring. Mass is 1 for every preset. */
export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

/** The live state of one spring: where it is and how fast it moves. */
export interface SpringState {
  position: number;
  velocity: number;
}

/** Names of the built-in presets. */
export type SpringPresetName = "snappy" | "smooth" | "bouncy" | "press";

/**
 * Starting presets, mass 1 throughout. Snappy suits micro-interactions
 * and toggles, smooth suits default transitions, bouncy suits playful
 * attention moments, and press suits button presses: fast with almost
 * no overshoot (damping ratio about 0.9, so it settles in ~0.2s).
 */
export const SPRING_PRESETS: Record<SpringPresetName, SpringConfig> = {
  snappy: { stiffness: 300, damping: 30, mass: 1 },
  smooth: { stiffness: 170, damping: 26, mass: 1 },
  bouncy: { stiffness: 200, damping: 15, mass: 1 },
  press: { stiffness: 500, damping: 40, mass: 1 },
};

/** Largest frame step the integrator accepts, in seconds. */
export const MAX_FRAME_DT = 1 / 30;

/** Default distance/velocity below which a spring snaps exactly to target. */
export const DEFAULT_SETTLE_EPSILON = 0.01;

/**
 * Advance one spring by one frame. Returns the next state plus whether
 * the spring has settled. The function is pure: it never mutates its
 * input state.
 *
 * - `dt` is clamped to at most 1/30s, so a slow frame cannot explode
 *   the spring.
 * - When both the distance to target and the velocity are below
 *   `settleEpsilon`, the state snaps exactly to the target with zero
 *   velocity and `settled` is true.
 */
export function springStep(
  state: SpringState,
  target: number,
  dt: number,
  config: SpringConfig,
  settleEpsilon: number = DEFAULT_SETTLE_EPSILON,
): { next: SpringState; settled: boolean } {
  const clampedDt = Math.min(dt, MAX_FRAME_DT);
  const acceleration =
    (-config.stiffness * (state.position - target) -
      config.damping * state.velocity) /
    config.mass;
  const velocity = state.velocity + acceleration * clampedDt;
  const position = state.position + velocity * clampedDt;
  if (
    Math.abs(position - target) < settleEpsilon &&
    Math.abs(velocity) < settleEpsilon
  ) {
    return { next: { position: target, velocity: 0 }, settled: true };
  }
  return { next: { position, velocity }, settled: false };
}

/**
 * Default resistance constant for rubberBand. A larger value means less
 * resistance at first and a faster approach to the ceiling; tune by feel.
 */
export const DEFAULT_RUBBER_BAND_RESISTANCE = 0.55;

/**
 * Progressive resistance for a pull past an edge, hyperbolic form:
 * offset grows more slowly the further the finger pulls, and can never
 * pass `extent` no matter how far the pull goes. `pull` is the finger
 * pull distance past the edge (>= 0), `extent` is the ceiling (usually
 * the screen or container height), and `resistance` is the constant
 * that shapes the curve.
 *
 * Properties: offset is 0 when pull is 0, grows monotonically with
 * pull, and stays strictly below `extent`. Non-positive pulls and
 * extents return 0.
 */
export function rubberBand(
  pull: number,
  extent: number,
  resistance: number = DEFAULT_RUBBER_BAND_RESISTANCE,
): number {
  if (pull <= 0 || extent <= 0 || resistance <= 0) {
    return 0;
  }
  return (1 - 1 / ((resistance * pull) / extent + 1)) * extent;
}

/**
 * Signed version of rubberBand: a pull past the top/leading edge
 * (positive) stretches in the positive direction, a pull past the
 * bottom/trailing edge (negative) stretches in the negative direction.
 * The magnitude still never passes `extent`.
 */
export function rubberBandSigned(
  pull: number,
  extent: number,
  resistance: number = DEFAULT_RUBBER_BAND_RESISTANCE,
): number {
  if (pull === 0) {
    return 0;
  }
  const sign = pull > 0 ? 1 : -1;
  return sign * rubberBand(Math.abs(pull), extent, resistance);
}
