/**
 * AttackComponent - grounded melee swing with a facing-aligned hitbox.
 *
 * Extends {@link DamageVolumeComponent} (shared with {@link ContactDamageComponent} on enemies):
 * one node is both the attack volume and the swing state machine. Physics is only armed during
 * the active window; overlaps damage any actor with `CharacterStatsComponent` once per swing.
 * Ground-gated (`GROUNDED_TAG`). Feedback goes through the shared hub.
 *
 * Timing fields are authored at 1× anim speed and scaled at runtime by
 * {@link PlayerAnimationSettingsComponent.attackPlaybackSpeed}.
 *
 * Kinematic (not static) on purpose: Rapier does not emit intersection events between two
 * *fixed* sensors, so a static hitbox would never overlap the enemy's static hurtbox.
 */
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { PlayerAnimationSettingsComponent } from '../animation/PlayerAnimationSettingsComponent.js';
import { DEFAULT_PLAYER_ANIMATION_TUNING } from '../animation/PlayerAnimationTuning.js';
import { feedback } from '../core/FeedbackEvents.js';
import { combatFeel } from '../feel/CombatFeel.js';
import { getPlatformerFacing } from '../movement/PlatformerModeShared.js';

import { DamageVolumeComponent } from './DamageVolumeComponent.js';

export interface AttackComponentOptions extends ENGINE.CollisionShapeNodeOptions {
  damage?: number;
  cooldown?: number;
  startup?: number;
  active?: number;
  recovery?: number;
  /** Hitbox half-extents (x, y). */
  hitboxHalfWidth?: number;
  hitboxHalfHeight?: number;
  /** Horizontal distance from the character center to the hitbox center (in facing dir). */
  reach?: number;
  /** Vertical offset of the hitbox center. */
  hitboxOffsetY?: number;
  cancelOnHit?: boolean;
  hitCancelRecovery?: number;
  hitCancelCooldown?: number;
}

enum AttackPhase {
  Idle,
  Startup,
  Active,
  Recovery,
}

@ENGINE.GameClass()
export class AttackComponent extends DamageVolumeComponent {
  @ENGINE.property({
    type: 'number',
    category: 'Melee',
    min: 0,
    max: 200,
    step: 1,
    description: 'Damage dealt per successful swing.',
  })
  public damage = 25;

  @ENGINE.property({
    type: 'number',
    category: 'Melee',
    min: 0,
    max: 2,
    step: 0.01,
    description: 'Extra wait after recovery before another swing can start (seconds).',
  })
  public cooldown = 0.15;

  @ENGINE.property({
    type: 'number',
    category: 'Hitbox',
    min: 0.1,
    max: 3,
    step: 0.05,
    description: 'Distance from character center to hitbox center along facing (units).',
  })
  public reach = 1.25;

  @ENGINE.property({
    type: 'number',
    category: 'Hitbox',
    min: 0.1,
    max: 3,
    step: 0.05,
    description: 'Half-width of the attack trigger box (units).',
  })
  public hitboxHalfWidth = 0.7;

  @ENGINE.property({
    type: 'number',
    category: 'Hitbox',
    min: 0.1,
    max: 3,
    step: 0.05,
    description: 'Half-height of the attack trigger box (units).',
  })
  public hitboxHalfHeight = 0.6;

  @ENGINE.property({
    type: 'number',
    category: 'Hitbox',
    min: -2,
    max: 2,
    step: 0.05,
    description: 'Vertical offset of the hitbox center (units).',
  })
  public hitboxOffsetY = 0;

  @ENGINE.property({
    type: 'number',
    category: 'Timing',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Wind-up before the hitbox arms, at 1× attack anim speed (seconds).',
  })
  public startup = 0.12;

  @ENGINE.property({
    type: 'number',
    category: 'Timing',
    min: 0.01,
    max: 1,
    step: 0.01,
    description: 'How long the hitbox stays armed, at 1× attack anim speed (seconds).',
  })
  public active = 0.18;

  @ENGINE.property({
    type: 'number',
    category: 'Timing',
    min: 0,
    max: 1.5,
    step: 0.01,
    description: 'Follow-through after the hitbox disarms on a miss, at 1× anim speed (seconds).',
  })
  public recovery = 0.33;

  @ENGINE.property({
    type: 'boolean',
    category: 'Hit Cancel',
    description: 'On first connect, shorten recovery so the next attack can start sooner.',
  })
  public cancelOnHit = true;

  @ENGINE.property({
    type: 'number',
    category: 'Hit Cancel',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Short rooted follow-through after a connect before unlocking (seconds).',
  })
  public hitCancelRecovery = 0.14;

  @ENGINE.property({
    type: 'number',
    category: 'Hit Cancel',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Cooldown after a hit-cancel (usually shorter than a full miss cooldown).',
  })
  public hitCancelCooldown = 0.08;

  private phase = AttackPhase.Idle;
  private phaseTime = 0;
  private cooldownRemaining = 0;
  private didHit = false;
  private readonly hitTargets = new Set<ENGINE.SceneNode>();
  private usingHitCancelRecovery = false;

  private mover: ENGINE.MoverNode | null = null;

  public override initialize(options?: AttackComponentOptions): void {
    this.damage = options?.damage ?? this.damage;
    this.cooldown = options?.cooldown ?? this.cooldown;
    this.startup = options?.startup ?? this.startup;
    this.active = options?.active ?? this.active;
    this.recovery = options?.recovery ?? this.recovery;
    this.hitboxHalfWidth = options?.hitboxHalfWidth ?? this.hitboxHalfWidth;
    this.hitboxHalfHeight = options?.hitboxHalfHeight ?? this.hitboxHalfHeight;
    this.reach = options?.reach ?? this.reach;
    this.hitboxOffsetY = options?.hitboxOffsetY ?? this.hitboxOffsetY;
    this.cancelOnHit = options?.cancelOnHit ?? this.cancelOnHit;
    this.hitCancelRecovery = options?.hitCancelRecovery ?? this.hitCancelRecovery;
    this.hitCancelCooldown = options?.hitCancelCooldown ?? this.hitCancelCooldown;

    const {
      damage: _d,
      cooldown: _c,
      startup: _s,
      active: _a,
      recovery: _r,
      hitboxHalfWidth: _hw,
      hitboxHalfHeight: _hh,
      reach: _reach,
      hitboxOffsetY: _oy,
      cancelOnHit: _coh,
      hitCancelRecovery: _hcr,
      hitCancelCooldown: _hcd,
      physicsOptions,
      ...rest
    } = options ?? {};

    // Unit box scaled by authored half-extents; Inspector size tweaks update `scale`.
    super.initialize({
      geometry: new THREE.BoxGeometry(1, 1, 1),
      scale: new THREE.Vector3(
        Math.max(0.05, this.hitboxHalfWidth) * 2,
        Math.max(0.05, this.hitboxHalfHeight) * 2,
        1,
      ),
      ...rest,
      physicsOptions: {
        enabled: false,
        motionType: ENGINE.PhysicsMotionType.KinematicPositionBased,
        collisionProfile: ENGINE.DefaultCollisionProfile.Trigger,
        generateCollisionEvents: true,
        ...physicsOptions,
      },
    });

    // Drive the body from the scene transform only; never let physics push this component back.
    this.setPhysicsTransformUpdateFlags({
      sendPosition: true,
      sendRotation: true,
      receivePosition: false,
      receiveRotation: false,
    });
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) {
      return false;
    }
    this.stripLegacyChildHitbox();
    return true;
  }

  public override endPlay(): boolean {
    if (!super.endPlay()) {
      return false;
    }
    this.disarm();
    return true;
  }

  /** Returns true while a swing is in progress. */
  public isAttacking(): boolean {
    return this.phase !== AttackPhase.Idle;
  }

  /** Begin a swing if allowed (idle, off cooldown, grounded). Returns true if the swing started. */
  public tryAttack(): boolean {
    if (this.phase !== AttackPhase.Idle || this.cooldownRemaining > 0) return false;
    if (!this.isGrounded()) return false;

    this.phase = AttackPhase.Startup;
    this.phaseTime = 0;
    this.didHit = false;
    this.usingHitCancelRecovery = false;
    this.hitTargets.clear();
    feedback.emit('attackStart', { position: this.getRoot()?.getWorldPosition().clone() });
    return true;
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.syncHitboxScale();
    if (combatFeel.isFrozen()) return;

    if (this.cooldownRemaining > 0) this.cooldownRemaining -= deltaTime;

    const speed = this.resolveAttackSpeed();
    const startup = this.startup / speed;
    const active = this.active / speed;
    const recovery = this.recovery / speed;

    switch (this.phase) {
      case AttackPhase.Startup:
        this.phaseTime += deltaTime;
        if (this.phaseTime >= startup) {
          this.phase = AttackPhase.Active;
          this.phaseTime = 0;
          this.arm();
        }
        break;
      case AttackPhase.Active:
        this.phaseTime += deltaTime;
        if (this.phaseTime >= active) {
          this.phase = AttackPhase.Recovery;
          this.phaseTime = 0;
          this.disarm();
          if (!this.didHit) feedback.emit('attackMiss');
        }
        break;
      case AttackPhase.Recovery: {
        this.phaseTime += deltaTime;
        const recoveryLen = this.usingHitCancelRecovery ? this.hitCancelRecovery : recovery;
        if (this.phaseTime >= recoveryLen) {
          const wasHitCancel = this.usingHitCancelRecovery;
          this.phase = AttackPhase.Idle;
          this.phaseTime = 0;
          this.usingHitCancelRecovery = false;
          this.cooldownRemaining = wasHitCancel ? this.hitCancelCooldown : this.cooldown;
          // Anim returns to idle after the short follow-through so the connect still reads.
          if (wasHitCancel) {
            feedback.emit('attackCancel', {
              position: this.getRoot()?.getWorldPosition().clone(),
            });
          }
        }
        break;
      }
      case AttackPhase.Idle:
      default:
        break;
    }
  }

  /** Prefabs that still nest a child Mesh/CollisionShape "AttackHitbox" — remove them. */
  private stripLegacyChildHitbox(): void {
    for (const child of [...this.children]) {
      // Keep the engine's internal THREE.Mesh debug child; only drop component siblings.
      if (!(child instanceof ENGINE.MeshNode)) continue;
      if (child.name !== 'AttackHitbox') continue;
      if (child instanceof ENGINE.PrimitiveNode) {
        child.overridePhysicsOptions({ enabled: false });
        child.setTickEnabled(false);
      }
      child.removeFromParent();
    }
  }

  private syncHitboxScale(): void {
    const w = Math.max(0.05, this.hitboxHalfWidth) * 2;
    const h = Math.max(0.05, this.hitboxHalfHeight) * 2;
    if (
      Math.abs(this.scale.x - w) > 1e-4
      || Math.abs(this.scale.y - h) > 1e-4
      || Math.abs(this.scale.z - 1) > 1e-4
    ) {
      this.scale.set(w, h, 1);
    }
  }

  private resolveAttackSpeed(): number {
    const settings = this.getRoot()?.getNode(PlayerAnimationSettingsComponent);
    const speed = settings?.attackPlaybackSpeed ?? DEFAULT_PLAYER_ANIMATION_TUNING.attackPlaybackSpeed;
    return Math.max(0.01, speed);
  }

  private isGrounded(): boolean {
    this.mover ??= this.getRoot()?.getNode(ENGINE.MoverNode) ?? null;
    return this.mover?.hasSyncTag(ENGINE.GROUNDED_TAG, true) ?? false;
  }

  private getFacing(): number {
    this.mover ??= this.getRoot()?.getNode(ENGINE.MoverNode) ?? null;
    return this.mover ? getPlatformerFacing(this.mover) : 1;
  }

  /** Position this volume in front of the character and enable its trigger body. */
  private arm(): void {
    const facing = this.getFacing();
    this.syncHitboxScale();
    this.position.set(facing * this.reach, this.hitboxOffsetY, 0);
    // Make sure the body is created at the up-to-date world position (in front of the
    // character), not at a stale transform from before this swing.
    this.updateWorldMatrix(true, false);
    this.overridePhysicsOptions({ enabled: true });
  }

  private disarm(): void {
    this.overridePhysicsOptions({ enabled: false });
  }

  protected override onVolumeOverlapBegin(other: ENGINE.PrimitiveNode): void {
    if (this.phase !== AttackPhase.Active) return;

    const target = other.getRoot();
    if (!target || this.hitTargets.has(target)) return;

    const stats = this.resolveTargetStats(other);
    if (!stats) return;

    this.hitTargets.add(target);
    this.didHit = true;
    stats.takeDamage(this.damage);

    const pos = target.getWorldPosition().clone();
    feedback.emit('attackHit', { position: pos, amount: this.damage });
    feedback.emit('hitSpark', { position: pos });

    if (this.cancelOnHit) {
      this.beginHitCancelRecovery();
    }
  }

  /**
   * Soft hit-cancel: stop dealing damage, keep a short rooted follow-through so the
   * connect reads, then unlock early (anim snaps to idle when recovery ends).
   */
  private beginHitCancelRecovery(): void {
    if (this.phase === AttackPhase.Idle || this.phase === AttackPhase.Recovery) return;
    this.disarm();
    this.phase = AttackPhase.Recovery;
    this.phaseTime = 0;
    this.usingHitCancelRecovery = true;
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_CollisionShape';
  }
}
