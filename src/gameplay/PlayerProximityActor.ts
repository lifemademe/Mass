/**
 * Shared base for player-radius volumes (checkpoints, pickups, exit reach, etc.).
 *
 * Detection uses an engine {@link ENGINE.TriggerZoneNode} (physics broadphase / overlap
 * events) — not a per-tick distance scan — so many volumes stay cheap. Subclasses implement
 * {@link onPlayerInRange}. One-shot volumes latch after the first enter; gated volumes
 * (e.g. locked exit) override {@link shouldAcceptProximity} and call
 * {@link flushActorsAlreadyInZone} when they unlock.
 *
 * Abstract — no `@GameClass()` (engine decorator requires a concrete constructor).
 * Scene-placed subclasses must be `@GameClass()` and may re-declare `radius` with `@property`.
 */
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { Action2DGameMode } from '../core/Action2DGameMode.js';
import { PlatformerPawn } from '../player/PlatformerPawn.js';

export interface PlayerProximityActorOptions extends ENGINE.SceneNodeOptions {
  /** Activation / collect radius in world units. */
  radius?: number;
}

export abstract class PlayerProximityActor extends ENGINE.SceneNode {
  /** Activation / collect radius in world units (expose with `@property` on concrete classes). */
  public radius = 1.6;

  /**
   * Local Y of the trigger center. Floor-pivoted visuals (checkpoint / exit) should lift this
   * to the mesh mid-height so the sphere is not buried in the ground.
   */
  protected zoneOffsetY = 0;

  /** When true, proximity fires at most once (then latches). */
  protected proximityOnce = true;

  private proximityLatched = false;
  private zone: ENGINE.TriggerZoneNode | null = null;
  private readonly onActorEnteredHandler = (node: ENGINE.SceneNode, _zone: ENGINE.TriggerZoneNode): void => {
    this.handleNodeEntered(node);
  };

  constructor() {
    super();
    this.isRoot = true;
  }

  public override initialize(options?: PlayerProximityActorOptions): void {
    super.initialize(options);
    this.radius = options?.radius ?? this.radius;

    // Unit sphere scaled by radius so Inspector radius tweaks can update `zone.scale`.
    this.zone = ENGINE.TriggerZoneNode.create({
      name: 'ProximityTrigger',
      geometry: new THREE.SphereGeometry(1, 12, 8),
      scale: new THREE.Vector3(this.radius, this.radius, this.radius),
      position: new THREE.Vector3(0, this.zoneOffsetY, 0),
      filter: ENGINE.TriggerFilter.PlayerOnly,
      enableDebugVisualization: false,
      physicsOptions: {
        enabled: true,
        motionType: ENGINE.PhysicsMotionType.Static,
        generateCollisionEvents: true,
        collisionProfile: ENGINE.DefaultCollisionProfile.Trigger,
      },
    });
    this.add(this.zone);
  }

  public override beginPlay(): boolean {
    // Prefab/scene spawn deserializes children and skips initialize() — rebind the zone
    // before play so enter handlers and radius sync attach to the authored trigger.
    this.bindRuntimeComponents();

    if (!super.beginPlay()) {
      return false;
    }
    this.syncZoneTransform();
    this.zone?.onActorEntered.add(this.onActorEnteredHandler);
    return true;
  }

  /** Resolve children after prefab/scene deserialize (`initialize()` is create()-only). */
  protected bindRuntimeComponents(): void {
    this.zone = this.getNode(ENGINE.TriggerZoneNode) ?? this.zone;
    // Prefab/scene authored the trigger transform — adopt it so syncZoneTransform is a no-op
    // during beginPlay (scale/position writes while Playing can remount physics children).
    if (this.zone) {
      const sx = this.zone.scale.x;
      if (Number.isFinite(sx) && sx > 0) {
        this.radius = sx;
      }
      this.zoneOffsetY = this.zone.position.y;
    }
  }

  public override endPlay(): boolean {
    if (!super.endPlay()) {
      return false;
    }
    this.zone?.onActorEntered.remove(this.onActorEnteredHandler);
    return true;
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.syncZoneTransform();
    this.tickProximityVisual(deltaTime);
  }

  /** Resolve the tracked platformer pawn, or null if not spawned yet. */
  protected resolvePlayer(): PlatformerPawn | null {
    return Action2DGameMode.get(this.getWorld())?.getPlayerPawn() ?? null;
  }

  /**
   * Gate whether an overlap should fire gameplay (e.g. exit still locked).
   * Default: accept until latched.
   */
  protected shouldAcceptProximity(): boolean {
    return true;
  }

  /** Optional per-frame visual (spin, pulse). Runs even when latched. */
  protected tickProximityVisual(_deltaTime: number): void {}

  /** Called when the player overlaps the trigger and acceptance is allowed. */
  protected abstract onPlayerInRange(player: PlatformerPawn): void;

  /** Clear the one-shot latch (rarely needed; tests / reuse). */
  protected resetProximityLatch(): void {
    this.proximityLatched = false;
  }

  /**
   * Re-check roots already inside the trigger (call when a gate opens so a player
   * standing in the volume still fires).
   */
  protected flushActorsAlreadyInZone(): void {
    const zone = this.zone;
    if (!zone) return;
    for (const node of zone.getActorsInZone()) {
      this.handleNodeEntered(node);
    }
  }

  private syncZoneTransform(): void {
    const zone = this.zone;
    if (!zone) return;
    const r = Math.max(0.05, this.radius);
    if (
      Math.abs(zone.scale.x - r) > 1e-4
      || Math.abs(zone.scale.y - r) > 1e-4
      || Math.abs(zone.scale.z - r) > 1e-4
    ) {
      zone.scale.set(r, r, r);
    }
    if (Math.abs(zone.position.y - this.zoneOffsetY) > 1e-4) {
      zone.position.y = this.zoneOffsetY;
    }
  }

  private handleNodeEntered(node: ENGINE.SceneNode): void {
    if (this.proximityLatched || !this.shouldAcceptProximity()) return;

    const player = node instanceof PlatformerPawn
      ? node
      : this.resolvePlayer();
    if (!player || node !== player) return;

    if (this.proximityOnce) this.proximityLatched = true;
    this.onPlayerInRange(player);
  }
}
