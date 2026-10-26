// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RUBBER_BAND_RESISTANCE,
  MAX_FRAME_DT,
  SPRING_PRESETS,
  rubberBand,
  rubberBandSigned,
  springStep,
  type SpringState,
} from "./math";

function settle(
  start: SpringState,
  target: number,
  preset: keyof typeof SPRING_PRESETS,
  dt: number = 1 / 60,
): { final: SpringState; steps: number; maxPosition: number } {
  let state = start;
  let steps = 0;
  let maxPosition = start.position;
  for (steps = 0; steps < 10000; steps += 1) {
    const { next, settled } = springStep(state, target, dt, SPRING_PRESETS[preset]);
    state = next;
    maxPosition = Math.max(maxPosition, state.position);
    if (settled) {
      break;
    }
  }
  return { final: state, steps: steps + 1, maxPosition };
}

describe("springStep", () => {
  it("settles exactly on the target with zero velocity", () => {
    const { final, steps } = settle({ position: 0, velocity: 0 }, 100, "smooth");
    expect(final.position).toBe(100);
    expect(final.velocity).toBe(0);
    expect(steps).toBeLessThan(10000);
  });

  it("settles back to zero after being stretched past the target", () => {
    const { final } = settle({ position: 40, velocity: 0 }, 0, "smooth");
    expect(final.position).toBe(0);
    expect(final.velocity).toBe(0);
  });

  it("clamps dt to 1/30 so a slow frame cannot change the step", () => {
    const state: SpringState = { position: 0, velocity: 50 };
    const slow = springStep(state, 100, 1, SPRING_PRESETS.smooth);
    const clamped = springStep(state, 100, MAX_FRAME_DT, SPRING_PRESETS.smooth);
    expect(slow.next).toEqual(clamped.next);
    expect(slow.settled).toBe(clamped.settled);
  });

  it("snaps exactly to target once inside the settle epsilon", () => {
    const { next, settled } = springStep(
      { position: 100, velocity: 0.005 },
      100,
      1 / 60,
      SPRING_PRESETS.smooth,
    );
    expect(settled).toBe(true);
    expect(next.position).toBe(100);
    expect(next.velocity).toBe(0);
  });

  it("does not mutate its input state", () => {
    const state: SpringState = { position: 0, velocity: 10 };
    springStep(state, 100, 1 / 60, SPRING_PRESETS.smooth);
    expect(state).toEqual({ position: 0, velocity: 10 });
  });

  it("bouncy overshoots the target before settling", () => {
    const { maxPosition, final } = settle({ position: 0, velocity: 0 }, 100, "bouncy");
    expect(maxPosition).toBeGreaterThan(100);
    expect(final.position).toBe(100);
  });

  it("press settles faster than smooth", () => {
    const press = settle({ position: 0, velocity: 0 }, 100, "press");
    const smooth = settle({ position: 0, velocity: 0 }, 100, "smooth");
    expect(press.steps).toBeLessThan(smooth.steps);
    expect(press.maxPosition).toBeLessThanOrEqual(100.5);
  });
});

describe("rubberBand", () => {
  it("returns 0 offset at zero pull", () => {
    expect(rubberBand(0, 400)).toBe(0);
    expect(rubberBand(-50, 400)).toBe(0);
  });

  it("grows monotonically with pull", () => {
    const samples = [0, 50, 100, 200, 400, 800, 1600].map((pull) =>
      rubberBand(pull, 400),
    );
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1]);
    }
  });

  it("never passes the ceiling, even for an extreme pull", () => {
    const extent = 400;
    expect(rubberBand(100000, extent)).toBeLessThan(extent);
    expect(rubberBand(100000, extent)).toBeGreaterThan(extent * 0.99);
  });

  it("grows more slowly as pull grows (progressive resistance)", () => {
    const early = rubberBand(100, 400) - rubberBand(0, 400);
    const late = rubberBand(500, 400) - rubberBand(400, 400);
    expect(late).toBeLessThan(early);
  });

  it("a larger resistance constant stretches further for the same pull", () => {
    expect(rubberBand(200, 400, 1.0)).toBeGreaterThan(
      rubberBand(200, 400, DEFAULT_RUBBER_BAND_RESISTANCE),
    );
  });

  it("returns 0 for a non-positive extent", () => {
    expect(rubberBand(100, 0)).toBe(0);
  });
});

describe("rubberBandSigned", () => {
  it("preserves the pull direction and never passes the ceiling", () => {
    expect(rubberBandSigned(200, 400)).toBe(rubberBand(200, 400));
    expect(rubberBandSigned(-200, 400)).toBe(-rubberBand(200, 400));
    expect(Math.abs(rubberBandSigned(-100000, 400))).toBeLessThan(400);
    expect(rubberBandSigned(0, 400)).toBe(0);
  });
});

describe("SPRING_PRESETS", () => {
  it("matches the documented stiffness/damping values at mass 1", () => {
    expect(SPRING_PRESETS.snappy).toEqual({ stiffness: 300, damping: 30, mass: 1 });
    expect(SPRING_PRESETS.smooth).toEqual({ stiffness: 170, damping: 26, mass: 1 });
    expect(SPRING_PRESETS.bouncy).toEqual({ stiffness: 200, damping: 15, mass: 1 });
    expect(SPRING_PRESETS.press.damping).toBeGreaterThan(0);
    expect(SPRING_PRESETS.press.mass).toBe(1);
  });
});
