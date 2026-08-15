/**
 * PatrolComponent - moves the owning actor back and forth between two X positions.
 *
 * Drives the actor's root position directly (the enemy is not KCC-simulated) and exposes the
 * current travel direction so the enemy visual can face the way it walks. Supports a short
 * hit-stun pause and horizontal knockback for combat feedback.
 */
import * as ENGINE from '@gnsx/genesys.js';

import { combatFeel } from '../feel/CombatFeel.js';

export interface PatrolComponentOptions extends ENGINE.SceneNodeOptions {
  /** Patrol speed in units/second. */
  speed?: number;
  /** Absolute left/right world X bounds. If omitted, derived from spawn X ± range. */
  leftX?: number;
  rightX?: number;
  /** Half-width of the patrol span when leftX/rightX are not given. */
  range?: number;
}

@ENGINE.GameClass()
export class PatrolComponent extends ENGINE.SceneNode {
  private speed = 2.5;
  private range = 3;
  private leftX: number | null = null;
  private rightX: number | null = null;

  private direction = 1;
  private stunRemaining = 0;
  private knockbackRemaining = 0;
  private knockbackVelocity = 0;

  public override initialize(options?: PatrolComponentOptions): void {
    super.initialize(options);
    this.speed = options?.speed ?? this.speed;
    this.range = options?.range ?? this.range;
    this.leftX = options?.leftX ?? null;
    this.rightX = options?.rightX ?? null;
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) {
      return false;
    }
    const root = this.getRoot();
    if (root && (this.leftX === null || this.rightX === null)) {
      const spawnX = root.getWorldPosition().x;
      this.leftX ??= spawnX - this.range;
      this.rightX ??= spawnX + this.range;
    }
    return true;
  }

  /** Current travel direction: +1 moving right, -1 moving left. */
  public getDirection(): number {
    return this.direction;
  }

  /** Set patrol travel direction: +1 right, -1 left (0 ignored). */
  public setDirection(sign: number): void {
    if (sign === 0) return;
    this.direction = Math.sign(sign);
  }

  /** True while hit-stun is active (patrol suppressed). */
  public isStunned(): boolean {
    return this.stunRemaining > 0;
  }

  /** Update patrol speed (Inspector / live enemy tuning). */
  public setSpeed(speed: number): void {
    this.speed = Math.max(0, speed);
  }

  /** Update half-width of the patrol span when bounds were derived from range. */
  public setRange(range: number): void {
    this.range = Math.max(0, range);
  }

  /**
   * Pause patrol and optionally shove the actor horizontally.
   * @param stunSeconds How long patrol stays frozen.
   * @param knockbackDistance World units to travel (0 = no shove).
   * @param knockbackDuration Seconds over which the shove is applied.
   * @param sign Horizontal sign: +1 shove right, -1 shove left.
   */
  public applyHitReaction(
    stunSeconds: number,
    knockbackDistance: number,
    knockbackDuration: number,
    sign: number,
  ): void {
    if (stunSeconds > 0) {
      this.stunRemaining = Math.max(this.stunRemaining, stunSeconds);
    }

    const push = Math.abs(knockbackDistance);
    const duration = Math.max(knockbackDuration, 0);
    if (push <= 0 || duration <= 0 || sign === 0) return;

    this.knockbackRemaining = duration;
    this.knockbackVelocity = Math.sign(sign) * (push / duration);
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    if (combatFeel.isFrozen()) return;

    const root = this.getRoot();
    if (root === null || this.leftX === null || this.rightX === null) return;

    if (this.stunRemaining > 0) {
      this.stunRemaining = Math.max(0, this.stunRemaining - deltaTime);
    }

    const pos = root.getWorldPosition();
    let x = pos.x;

    if (this.knockbackRemaining > 0) {
      const step = Math.min(deltaTime, this.knockbackRemaining);
      x += this.knockbackVelocity * step;
      this.knockbackRemaining = Math.max(0, this.knockbackRemaining - step);
      if (this.knockbackRemaining <= 0) this.knockbackVelocity = 0;
    } else if (this.stunRemaining <= 0) {
      x += this.direction * this.speed * deltaTime;

      if (x >= this.rightX) {
        x = this.rightX;
        this.direction = -1;
      } else if (x <= this.leftX) {
        x = this.leftX;
        this.direction = 1;
      }
    }

    root.position.setX(x);
  }

  public override getEditorClassIcon(): string | null {
    // Engine path/patrol glyph (Icon_Movement does not exist in the icon set).
    return 'Icon_Path';
  }
}
