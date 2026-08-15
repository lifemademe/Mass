/**
 * PlatformerMovementConfig - all tunable values for the 2D side-on character controller.
 *
 * Shared by `PlatformerGroundMode` and `PlatformerAirMode`. Every value maps to a knob
 * called out in the technical brief (movement, jump, gravity, air control, ground check).
 */

export interface PlatformerMovementConfig {
  /** Horizontal max speed in units/second. */
  moveSpeed: number;
  /** Horizontal acceleration toward target speed (units/second^2). */
  acceleration: number;
  /** Horizontal deceleration to a stop when there is no input (units/second^2). */
  deceleration: number;
  /** Multiplier applied to accel/decel while airborne (0 = no air control, 1 = full). */
  airControl: number;

  /** Initial upward velocity applied on jump (units/second). Reaches ~maxJumpHeight if held. */
  jumpForce: number;
  /** Velocity multiplier applied when jump is released while still rising (variable jump). */
  jumpCutMultiplier: number;
  /** Reference min jump height (informational; tune jumpCutMultiplier to match). */
  minJumpHeight: number;
  /** Reference max jump height (informational; tune jumpForce/gravity to match). */
  maxJumpHeight: number;

  /** Downward acceleration while rising (units/second^2, positive magnitude). */
  gravity: number;
  /** Downward acceleration while falling (usually higher than gravity for a snappy arc). */
  fallGravity: number;
  /** Terminal downward speed (units/second). */
  maxFallSpeed: number;

  /** Grace period after leaving a ledge during which a jump still counts (seconds). */
  coyoteTime: number;
  /** Window before landing during which a jump press is remembered (seconds). */
  jumpBufferTime: number;

  /** KCC snap-to-ground distance; keeps the character glued over small seams (units). */
  groundCheckDistance: number;
  /** World Z plane the character is locked to (side-on gameplay stays planar). */
  planeZ: number;
}

/** Returns a fresh config with sensible platformer defaults. */
export function defaultPlatformerMovementConfig(): PlatformerMovementConfig {
  return {
    moveSpeed: 7,
    acceleration: 80,
    deceleration: 60,
    airControl: 0.65,

    jumpForce: 13,
    jumpCutMultiplier: 0.45,
    minJumpHeight: 1.2,
    maxJumpHeight: 3.5,

    gravity: 34,
    fallGravity: 55,
    maxFallSpeed: 35,

    coyoteTime: 0.12,
    jumpBufferTime: 0.12,

    groundCheckDistance: 0.15,
    planeZ: 0,
  };
}
