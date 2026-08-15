/**
 * ContactDamageComponent - trigger volume that damages the player while overlapping.
 *
 * Extends {@link DamageVolumeComponent} (shared with {@link AttackComponent} on the player):
 * one node is both the hittable hurtbox (player attacks overlap it) and the contact-damage
 * sensor. Overlaps are tracked via the base's `onVolumeOverlapBegin` / `onVolumeOverlapEnd`
 * hooks; damage applies per tick through `PlayerHealthComponent` (i-frames throttle repeats).
 * No per-frame world scans.
 *
 * Motion must be kinematic (not static): patrol teleports the enemy each frame, and Rapier
 * often skips stop-overlap events for moving static sensors — leaving a stale map entry that
 * keeps applying damage every i-frame window after the player has already left.
 *
 * Target scope is enemy-specific (player only) via the {@link isValidTarget} override below —
 * the base class targets any `CharacterStatsComponent` by default, so enabling enemy-vs-enemy
 * damage or hazards elsewhere is a matter of relaxing (or removing) that override, not
 * rewriting this class.
 */
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { feedback } from '../core/FeedbackEvents.js';
import { PatrolComponent } from '../enemy/PatrolComponent.js';
import { PlayerHealthComponent } from '../player/PlayerHealthComponent.js';

import { AttackComponent } from './AttackComponent.js';
import { DamageVolumeComponent } from './DamageVolumeComponent.js';

export interface ContactDamageComponentOptions extends ENGINE.CollisionShapeNodeOptions {
  damage?: number;
}

@ENGINE.GameClass()
export class ContactDamageComponent extends DamageVolumeComponent {
  private damage = 20;

  /** Overlapping player colliders -> their health component (keyed by collider so multiple
   *  player colliders, e.g. body + attack hitbox, don't clobber each other's overlap state). */
  private readonly overlapping = new Map<ENGINE.PrimitiveNode, PlayerHealthComponent>();

  private readonly _hurtboxWorld = new THREE.Vector3();
  private readonly _otherWorld = new THREE.Vector3();

  public override initialize(options?: ContactDamageComponentOptions): void {
    // Defaults when used as an enemy combat volume (callers may override geometry / pose).
    const { damage, physicsOptions, ...rest } = options ?? {};
    super.initialize({
      geometry: new THREE.SphereGeometry(0.8),
      position: new THREE.Vector3(0, 0.4, 0),
      ...rest,
      physicsOptions: {
        enabled: true,
        collisionProfile: ENGINE.DefaultCollisionProfile.Trigger,
        generateCollisionEvents: true,
        ...physicsOptions,
        // Kinematic: patrol moves this volume every frame. Static sensors often miss exits
        // (stale overlap → damage every i-frame window). Force after spread so prefabs can't override.
        motionType: ENGINE.PhysicsMotionType.KinematicPositionBased,
      },
    });
    this.damage = damage ?? this.damage;

    // Scene transform owns the body (patrol writes actor root); physics must not push back.
    this.setPhysicsTransformUpdateFlags({
      sendPosition: true,
      sendRotation: true,
      receivePosition: false,
      receiveRotation: false,
    });
  }

  /** Update contact damage (Inspector / live enemy tuning). */
  public setDamage(damage: number): void {
    this.damage = Math.max(0, damage);
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) {
      return false;
    }
    // Prefab instances may deserialize an older Static motion type — force kinematic.
    this.overridePhysicsOptions({
      motionType: ENGINE.PhysicsMotionType.KinematicPositionBased,
    });
    return true;
  }

  public override endPlay(): boolean {
    if (!super.endPlay()) {
      return false;
    }
    this.overlapping.clear();
    return true;
  }

  protected override onVolumeOverlapBegin(other: ENGINE.PrimitiveNode): void {
    if (!this.isValidTarget(other)) return;

    const health = other.getRoot()?.getNode(PlayerHealthComponent);
    if (health) this.overlapping.set(other, health);
  }

  protected override onVolumeOverlapEnd(other: ENGINE.PrimitiveNode): void {
    this.overlapping.delete(other);
  }

  /**
   * Contact damage must only track the player's solid capsule/body.
   *
   * The attack hitbox is a kinematic trigger that arms/disarms mid-swing; Rapier does not
   * emit stop-overlap when that collider is disabled. If we ever key the map on it, the
   * player keeps taking contact damage after the swing (feels like "attacking hurts me").
   *
   * Fail closed when physics state is missing — never assume a collider is solid. The final
   * line is what scopes this to "player only"; relax it to target any `CharacterStatsComponent`
   * (the base default) to allow enemy-vs-enemy damage or hazards.
   */
  protected override isValidTarget(other: ENGINE.PrimitiveNode): boolean {
    if (other instanceof AttackComponent) return false;

    const state = this.getPhysicsEngine()?.getNodeState(other);
    if (!state || state.isTrigger) return false;

    if (!super.isValidTarget(other)) return false;

    return !!other.getRoot()?.getNode(PlayerHealthComponent);
  }

  /**
   * Drop map entries that are clearly no longer in contact (missed stop-overlap events).
   * Radius = authored sphere (0.8) * scale + generous player-capsule margin.
   */
  private pruneStaleOverlaps(): void {
    if (this.overlapping.size === 0) return;

    this.getWorldPosition(this._hurtboxWorld);
    const radius = 0.8 * Math.max(this.scale.x, this.scale.y, this.scale.z);
    const maxSep = radius + 1.75;
    const maxSepSq = maxSep * maxSep;

    for (const [other, health] of this.overlapping) {
      if (!other.parent || !health.parent || !this.isValidTarget(other)) {
        this.overlapping.delete(other);
        continue;
      }
      other.getWorldPosition(this._otherWorld);
      if (this._hurtboxWorld.distanceToSquared(this._otherWorld) > maxSepSq) {
        this.overlapping.delete(other);
      }
    }
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.pruneStaleOverlaps();
    if (this.overlapping.size === 0) return;

    const root = this.getRoot();
    const origin = root?.getWorldPosition();
    const damaged = new Set<PlayerHealthComponent>();
    let fleeFromX: number | null = null;
    for (const health of this.overlapping.values()) {
      if (health.getIsDead() || damaged.has(health)) continue;
      damaged.add(health);
      if (health.applyDamage(this.damage, origin?.clone())) {
        fleeFromX = health.getRoot()?.getWorldPosition().x ?? fleeFromX;
        feedback.emit('enemyAttack', { position: origin?.clone(), amount: this.damage });
      }
    }
    // After a successful bite, walk away from the player on X.
    if (fleeFromX !== null && origin) {
      const away = Math.sign(origin.x - fleeFromX);
      root?.getNode(PatrolComponent)?.setDirection(away !== 0 ? away : -1);
    }
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_CharacterStats';
  }
}
