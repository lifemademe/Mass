/**
 * DamageVolumeComponent - shared base for CollisionShapeComponent-based damage volumes.
 *
 * `AttackComponent` (player melee, a windowed one-shot swing) and `ContactDamageComponent`
 * (enemy hurtbox, a persistent per-tick sensor) both follow the "one node = trigger shape +
 * damage logic" pattern. Physics setup (geometry, arm/disarm timing, forced motion type) stays
 * on each subclass — those differ meaningfully between the two lifecycles, and both already
 * carry hard-won footgun comments about kinematic vs static sensors. This base only extracts
 * the two pieces that are genuinely identical:
 *
 *   - Overlap-handler binding: defer one tick after `beginPlay` so this collider's physics
 *     body is registered before subscribing (`onVolumeOverlapBegin` / `onVolumeOverlapEnd`).
 *   - Generic target resolution: any living root with a `CharacterStatsComponent` is a valid
 *     damage target by default. Subclasses that must scope targets further (e.g. enemy contact
 *     damage restricting to the player) override {@link isValidTarget} — a single, obvious
 *     extension point instead of a hand-rolled private check duplicated at every call site.
 *
 * Abstract — no `@GameClass()` (engine decorator requires a concrete constructor).
 */
import * as ENGINE from '@gnsx/genesys.js';

export abstract class DamageVolumeComponent extends ENGINE.CollisionShapeNode {
  private volumeOverlapBound = false;

  public override beginPlay(): boolean {
    if (!super.beginPlay()) {
      return false;
    }
    this.getWorld()?.runInNextTick(() => this.bindVolumeOverlapHandlers());
    return true;
  }

  public override endPlay(): boolean {
    if (!super.endPlay()) {
      return false;
    }
    this.volumeOverlapBound = false;
    return true;
  }

  /**
   * True when `other` belongs to a valid damage target: default is any living root with a
   * `CharacterStatsComponent`, excluding this volume's own root. Override to scope further
   * (e.g. "player only", a faction check, or a hazard that ignores a specific tag).
   */
  protected isValidTarget(other: ENGINE.PrimitiveNode): boolean {
    const target = other.getRoot();
    if (!target || target === this.getRoot()) return false;
    const stats = target.getNode(ENGINE.CharacterStatsNode);
    return !!stats && !stats.getIsDead();
  }

  /** `CharacterStatsComponent` on `other`'s root, or null when `other` is not a valid target. */
  protected resolveTargetStats(other: ENGINE.PrimitiveNode): ENGINE.CharacterStatsNode | null {
    if (!this.isValidTarget(other)) return null;
    return other.getRoot()?.getNode(ENGINE.CharacterStatsNode) ?? null;
  }

  /** Overlap-begin hook. Fires once handlers are bound (deferred one tick after `beginPlay`). */
  protected onVolumeOverlapBegin(_other: ENGINE.PrimitiveNode): void {}

  /** Overlap-end hook. No-op unless a subclass needs to track ongoing overlaps. */
  protected onVolumeOverlapEnd(_other: ENGINE.PrimitiveNode): void {}

  private bindVolumeOverlapHandlers(): void {
    if (this.volumeOverlapBound) return;
    this.volumeOverlapBound = true;
    this.onOverlapWith.add((_self, other) => this.onVolumeOverlapBegin(other));
    this.onStopOverlappingWith.add((_self, other) => this.onVolumeOverlapEnd(other));
  }
}
