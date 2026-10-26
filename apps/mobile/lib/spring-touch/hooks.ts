// Spring Touch hooks: Reanimated wrappers over lib/spring-touch/math.
//
// These hooks animate transform and opacity only, never layout
// properties. They are interruptible by construction: the shared value
// is never reset, so a new animation always starts from the live
// on-screen value, and Reanimated carries the running spring's
// velocity into the replacement spring. Input is never locked while
// an animation runs.
//
// Reduced motion is respected through React Native AccessibilityInfo:
// when it is on, springs are replaced with a short, bounce-free
// crossfade-length timing animation. Motion is feedback only; callers
// must still communicate state changes with labels or haptics, never
// with motion alone.

import { useEffect, useState } from "react";
import { AccessibilityInfo, Dimensions, type ViewStyle } from "react-native";
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type AnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import {
  DEFAULT_RUBBER_BAND_RESISTANCE,
  SPRING_PRESETS,
  rubberBandSigned,
  type SpringPresetName,
} from "./math";

/** Duration of the reduced-motion fallback animation, in milliseconds. */
export const REDUCED_MOTION_DURATION_MS = 120;

/**
 * Live Reduce Motion setting. Reads the current value once, then
 * follows changes while mounted.
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) {
          setReducedMotion(value);
        }
      })
      .catch(() => {
        // Keep the default (motion on) if the setting cannot be read.
      });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return reducedMotion;
}

export interface PressScaleOptions {
  /** Scale while pressed. Defaults to 0.96. */
  pressedScale?: number;
  /** Spring preset for press and release. Defaults to "press". */
  preset?: SpringPresetName;
  /** When true, press handlers do nothing and the value returns to 1. */
  disabled?: boolean;
}

export interface PressScaleResult {
  /** Animated style for the pressable: transform scale only. */
  animatedStyle: AnimatedStyle<ViewStyle>;
  /** Wire to Pressable's onPressIn. */
  onPressIn: () => void;
  /** Wire to Pressable's onPressOut. */
  onPressOut: () => void;
  /** Whether the reduced-motion fallback is active. */
  reducedMotion: boolean;
}

/**
 * Interruptible press scale. Pressing springs the value to
 * `pressedScale`; releasing springs it back to 1. A press, release,
 * or re-press mid-flight never jumps and never hard-stops: the new
 * spring starts from the live value with the live velocity carried
 * forward. Reduced motion swaps the spring for a short, bounce-free
 * timing animation.
 */
export function usePressScale(
  options: PressScaleOptions = {},
): PressScaleResult {
  const { pressedScale = 0.96, preset = "press", disabled = false } = options;
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const animateTo = (target: number) => {
    if (reducedMotion) {
      // Reanimated shared values are designed to be written to; the
      // immutability rule below does not apply to them.
      // eslint-disable-next-line react-hooks/immutability
      scale.value = withTiming(target, {
        duration: REDUCED_MOTION_DURATION_MS,
      });
    } else {
      scale.value = withSpring(target, SPRING_PRESETS[preset]);
    }
  };

  const onPressIn = () => {
    if (!disabled) {
      animateTo(pressedScale);
    }
  };

  const onPressOut = () => {
    if (!disabled) {
      animateTo(1);
    }
  };

  useEffect(() => {
    if (!disabled) {
      return;
    }
    // Reanimated shared values are designed to be written to; the
    // immutability rule below does not apply to them.
    // eslint-disable-next-line react-hooks/immutability
    scale.value = reducedMotion
      ? withTiming(1, { duration: REDUCED_MOTION_DURATION_MS })
      : withSpring(1, SPRING_PRESETS[preset]);
  }, [disabled, preset, reducedMotion, scale]);

  return { animatedStyle, onPressIn, onPressOut, reducedMotion };
}

export interface RubberBandOverscrollOptions {
  /**
   * The stretch ceiling, usually the scroll container's height.
   * Defaults to the window height when the caller does not know the
   * container height.
   */
  extent?: number;
  /** Resistance constant for the rubber-band curve. */
  resistance?: number;
  /** Spring preset used when the stretch releases back to the edge. */
  preset?: SpringPresetName;
}

export interface RubberBandOverscrollResult {
  /** Animated style for the scrollable content wrapper: translateY only. */
  overscrollStyle: AnimatedStyle<ViewStyle>;
  /** Live overscroll offset, for gesture wiring that needs it. */
  overscroll: SharedValue<number>;
  /**
   * Track a drag past an edge 1:1, with rubber-band resistance.
   * Positive `pullPastEdge` means pulled past the top/leading edge
   * (content translates down); negative means pulled past the
   * bottom/trailing edge. Call on every scroll/drag update past the
   * edge; call releaseOverscroll when the gesture ends.
   */
  applyOverscroll: (pullPastEdge: number) => void;
  /** Spring the stretch back to the edge from its live value. */
  releaseOverscroll: () => void;
  /** Whether the reduced-motion fallback is active. */
  reducedMotion: boolean;
}

/**
 * Rubber-band overscroll for a scrollable list. While the user drags
 * past an edge, applyOverscroll maps the pull through the
 * rubber-band curve so the stretch grows with resistance and can
 * never pass the ceiling. On release, releaseOverscroll springs the
 * content back to the edge from its live stretched position and
 * velocity, never by resetting to zero. Reduced motion swaps the
 * release spring for a short, bounce-free timing animation.
 *
 * Wiring is the apply worker's job: feed this from the list's scroll
 * or gesture handler (past-edge distance only; in-bounds scrolling
 * stays with the native scroller) and apply overscrollStyle to the
 * content wrapper.
 */
export function useRubberBandOverscroll(
  options: RubberBandOverscrollOptions = {},
): RubberBandOverscrollResult {
  const {
    extent = Dimensions.get("window").height,
    resistance = DEFAULT_RUBBER_BAND_RESISTANCE,
    preset = "smooth",
  } = options;
  const reducedMotion = useReducedMotion();
  const overscroll = useSharedValue(0);
  const overscrollStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: overscroll.value }],
  }));

  const applyOverscroll = (pullPastEdge: number) => {
    // Reanimated shared values are designed to be written to; the
    // immutability rule below does not apply to them.
    // eslint-disable-next-line react-hooks/immutability
    overscroll.value = rubberBandSigned(pullPastEdge, extent, resistance);
  };

  const releaseOverscroll = () => {
    if (reducedMotion) {
      // eslint-disable-next-line react-hooks/immutability
      overscroll.value = withTiming(0, {
        duration: REDUCED_MOTION_DURATION_MS,
      });
    } else {
      overscroll.value = withSpring(0, SPRING_PRESETS[preset]);
    }
  };

  return {
    overscrollStyle,
    overscroll,
    applyOverscroll,
    releaseOverscroll,
    reducedMotion,
  };
}
