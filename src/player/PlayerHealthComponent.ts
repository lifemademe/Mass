/**
 * PlayerHealthComponent - player health built on top of the engine's CharacterStatsComponent.
 *
 * The base component tracks health/death, fires `onHealthChanged` / `onDeath`, and (since it now
 * exposes a public `revive()`) supports coming back from death. Rather than duplicate a parallel
 * health system, this subclass reuses everything from the base and only adds what the respawn
 * loop needs:
 *   - invulnerability frames after taking a hit,
 *   - feedback events on damage/death,
 *   - a `handleDeath` override that leaves the corpse in-world until the player presses R,
 *   - i-frame reset on `revive()`.
 *
 * Keeping the player a real `CharacterStatsComponent` means engine systems that look one up
 * (pickups, damage sources, HUD binding) work transparently.
 */
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { feedback } from '../core/FeedbackEvents.js';
import { getPlatformerFacing } from '../movement/PlatformerModeShared.js';

export interface PlayerHealthComponentOptions extends ENGINE.CharacterStatsNodeOptions {
  /** Duration of invulnerability after taking a hit (seconds). */
  invulnDuration?: number;
  /** World units shoved away from the attacker on hit (0 disables). */
  knockbackDistance?: number;
  /** Seconds over which knockback distance is applied. */
  knockbackDuration?: number;
}

@ENGINE.GameClass()
export class PlayerHealthComponent extends ENGINE.CharacterStatsNode {
  private invulnRemaining = 0;

  @ENGINE.property({
    type: 'number',
    category: 'Health',
    min: 0,
    max: 5,
    step: 0.05,
    description: 'Seconds of invulnerability frames after taking a hit (0 disables).',
  })
  public invulnDuration = 1.0;

  @ENGINE.property({
    type: 'number',
    category: 'Hit Reaction',
    min: 0,
    max: 3,
    step: 0.05,
    description: 'World units shoved away from the attacker along facing on hit (0 disables).',
  })
  public knockbackDistance = 0.85;

  @ENGINE.property({
    type: 'number',
    category: 'Hit Reaction',
    min: 0.05,
    max: 1,
    step: 0.01,
    description: 'Seconds over which knockback distance is applied.',
  })
  public knockbackDuration = 0.14;

  private knockbackRemaining = 0;
  private knockbackVelocity = 0;

  public override initialize(options?: PlayerHealthComponentOptions): void {
    // Player health does not auto-regenerate unless the caller opts in.
    super.initialize({ healthRegen: 0, ...options });
    this.invulnDuration = options?.invulnDuration ?? this.invulnDuration;
    this.knockbackDistance = options?.knockbackDistance ?? this.knockbackDistance;
    this.knockbackDuration = options?.knockbackDuration ?? this.knockbackDuration;
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) {
      return false;
    }
    this.onHealthChanged.invoke(this.getCurrentHealth(), this.getMaxHealth());
    return true;
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    if (this.invulnRemaining > 0) {
      this.invulnRemaining -= deltaTime;
      if (this.invulnRemaining <= 0) {
        this.invulnRemaining = 0;
        feedback.emit('invulnEnd');
      }
    }
  }

  public getIsInvulnerable(): boolean {
    return this.invulnRemaining > 0;
  }

  public override takeDamage(amount: number, hitInfo?: ENGINE.DamageHitInfo): number {
    if (this.getIsDead() || this.invulnRemaining > 0 || amount <= 0) return 0;

    const dealt = super.takeDamage(amount, hitInfo);
    if (dealt > 0) {
      feedback.emit('playerDamage', {
        amount: dealt,
        position: hitInfo?.hitLocation.clone() ?? this.getRoot()?.getWorldPosition().clone(),
      });
      this.beginKnockback(hitInfo?.hitLocation);
      // Death feedback is handled in handleDeath (invoked by the base class).
      if (!this.getIsDead()) {
        this.invulnRemaining = this.invulnDuration;
        feedback.emit('invulnStart');
      }
    }
    return dealt;
  }

  /**
   * Advances knockback and returns the horizontal velocity to apply this frame,
   * or `null` when no shove is active. Called from the platformer sim.
   */
  public tickKnockback(deltaTime: number): number | null {
    if (this.knockbackRemaining <= 0) return null;
    const step = Math.min(deltaTime, this.knockbackRemaining);
    this.knockbackRemaining = Math.max(0, this.knockbackRemaining - step);
    const velocity = this.knockbackVelocity;
    if (this.knockbackRemaining <= 0) this.knockbackVelocity = 0;
    return velocity;
  }

  /** Push away from `fromPosition` on X; fall back to opposite facing. */
  private beginKnockback(fromPosition?: THREE.Vector3): void {
    const push = Math.abs(this.knockbackDistance);
    const duration = Math.max(0.05, this.knockbackDuration);
    if (push <= 0) {
      this.knockbackRemaining = 0;
      this.knockbackVelocity = 0;
      return;
    }

    const root = this.getRoot();
    if (!root) return;

    const playerX = root.getWorldPosition().x;
    let sign = 0;
    if (fromPosition) {
      const dx = playerX - fromPosition.x;
      if (Math.abs(dx) > 1e-4) sign = Math.sign(dx);
    }
    if (sign === 0) {
      const mover = root.getNode(ENGINE.MoverNode);
      sign = mover ? -getPlatformerFacing(mover) : -1;
    }

    this.knockbackRemaining = duration;
    this.knockbackVelocity = sign * (push / duration);
  }

  /**
   * Convenience wrapper for proximity-based damage sources. Returns true if damage was applied
   * (i.e. the player was neither dead nor invulnerable).
   */
  public applyDamage(amount: number, fromPosition?: THREE.Vector3): boolean {
    const hitInfo = fromPosition
      ? { hitLocation: fromPosition, hitNormal: new THREE.Vector3() }
      : undefined;
    return this.takeDamage(amount, hitInfo) > 0;
  }

  /**
   * Player death does not destroy the actor and does not auto-respawn.
   * The corpse stays in-world (death anim + fall) until the player presses R.
   */
  protected override handleDeath(hitInfo?: ENGINE.DamageHitInfo): void {
    this.invulnRemaining = 0;
    feedback.emit('playerDeath', {
      position: hitInfo?.hitLocation.clone() ?? this.getRoot()?.getWorldPosition().clone(),
    });
  }

  /** Restore full health and clear death/invulnerability (used on respawn). */
  public override revive(health?: number): void {
    super.revive(health);
    this.invulnRemaining = 0;
    this.knockbackRemaining = 0;
    this.knockbackVelocity = 0;
  }
}
