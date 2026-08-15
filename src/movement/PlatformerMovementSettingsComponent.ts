/**
 * Inspector-facing knobs for platformer locomotion / jump feel.
 *
 * Modes read {@link toConfig} every simulation tick so Play/edit tweaks apply live.
 * Internal plane lock / ground-probe distances stay in {@link defaultPlatformerMovementConfig}.
 */
import * as ENGINE from '@gnsx/genesys.js';

import {
  defaultPlatformerMovementConfig,
  type PlatformerMovementConfig,
} from './PlatformerMovementConfig.js';

@ENGINE.GameClass()
export class PlatformerMovementSettingsComponent extends ENGINE.SceneNode {
  @ENGINE.property({
    type: 'number',
    category: 'Movement',
    min: 0.5,
    max: 20,
    step: 0.1,
    description: 'Max horizontal speed (units/s).',
  })
  public moveSpeed = 7;

  @ENGINE.property({
    type: 'number',
    category: 'Movement',
    min: 1,
    max: 200,
    step: 1,
    description: 'How fast speed ramps toward moveSpeed on ground (units/s²).',
  })
  public acceleration = 80;

  @ENGINE.property({
    type: 'number',
    category: 'Movement',
    min: 1,
    max: 200,
    step: 1,
    description: 'How fast the character brakes with no input (units/s²).',
  })
  public deceleration = 60;

  @ENGINE.property({
    type: 'number',
    category: 'Jump',
    min: 1,
    max: 40,
    step: 0.1,
    description: 'Initial upward velocity on jump (units/s).',
  })
  public jumpForce = 13;

  @ENGINE.property({
    type: 'number',
    category: 'Jump',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Multiplier on upward velocity when jump is released early (variable jump height).',
  })
  public jumpCutMultiplier = 0.45;

  @ENGINE.property({
    type: 'number',
    category: 'Jump',
    min: 1,
    max: 100,
    step: 0.5,
    description: 'Downward acceleration while rising (units/s²).',
  })
  public gravity = 34;

  @ENGINE.property({
    type: 'number',
    category: 'Jump',
    min: 1,
    max: 120,
    step: 0.5,
    description: 'Downward acceleration while falling (higher = snappier fall).',
  })
  public fallGravity = 55;

  @ENGINE.property({
    type: 'number',
    category: 'Jump',
    min: 1,
    max: 80,
    step: 0.5,
    description: 'Terminal fall speed (units/s).',
  })
  public maxFallSpeed = 35;

  @ENGINE.property({
    type: 'number',
    category: 'Jump',
    min: 0,
    max: 0.5,
    step: 0.01,
    description: 'Seconds after leaving a ledge where jump still works (coyote time).',
  })
  public coyoteTime = 0.12;

  @ENGINE.property({
    type: 'number',
    category: 'Jump',
    min: 0,
    max: 0.5,
    step: 0.01,
    description: 'Seconds a jump press is remembered before landing (jump buffer).',
  })
  public jumpBufferTime = 0.12;

  @ENGINE.property({
    type: 'number',
    category: 'Air',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Fraction of ground accel/decel available in air (0 = none, 1 = full).',
  })
  public airControl = 0.65;

  /** Build a full movement config, filling internals from template defaults. */
  public toConfig(): PlatformerMovementConfig {
    const defaults = defaultPlatformerMovementConfig();
    return {
      ...defaults,
      moveSpeed: this.moveSpeed,
      acceleration: this.acceleration,
      deceleration: this.deceleration,
      airControl: this.airControl,
      jumpForce: this.jumpForce,
      jumpCutMultiplier: this.jumpCutMultiplier,
      gravity: this.gravity,
      fallGravity: this.fallGravity,
      maxFallSpeed: this.maxFallSpeed,
      coyoteTime: this.coyoteTime,
      jumpBufferTime: this.jumpBufferTime,
    };
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_Character';
  }
}
