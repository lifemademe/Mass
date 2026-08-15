/**
 * Tuning for the Odyssey-style player animation driver
 * ({@link ./PlayerAnimationController.js}). Maps raw movement/health state onto the
 * animation graph in `@project/assets/models/character/mannequin.animconfig.json`
 * (ported from the thirdPersonPlatformer template).
 */
export const DEFAULT_PLAYER_ANIMATION_TUNING = {
  /** Normalized planar speed (speed / maxSpeed) below which the player is treated as idle. */
  moveThreshold: 0.06,
  /** Seconds standing still before an idle-break animation is triggered. */
  idleBreakDelaySeconds: 8,
  /** Downward landing speed (m/s) at or above which a heavy landing plays instead of a light one. */
  hardLandingSpeed: 25,
  /** Vertical-velocity magnitude (m/s) mapped to the full air rise/fall blend crossfade. */
  airBlendRange: 12,
  /** Safety timeout (s): force the air loop if a take-off clip never reports finished. */
  takeoffTimeoutSeconds: 0.5,
  /** Safety timeout (s): leave a landing state if its clip never reports finished. */
  landingTimeoutSeconds: 0.6,
  /** Safety timeout (s): leave the damage state if its clip never reports finished. */
  damageTimeoutSeconds: 0.8,
  /** Playback rate for SwordSlash (1 = native clip length ~0.63s). */
  attackPlaybackSpeed: 1.0,
  /** Safety timeout (s): leave the attack state if SwordSlash never reports finished. */
  attackTimeoutSeconds: 0.6,
} as const;

export type PlayerAnimationTuning = {
  [K in keyof typeof DEFAULT_PLAYER_ANIMATION_TUNING]: number;
};
