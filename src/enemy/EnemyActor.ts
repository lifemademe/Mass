/**
 * EnemyActor - a single patrolling melee enemy (spider) for the sample level.
 *
 * Composed from engine + template components: a GLB visual, `CharacterStatsComponent` for
 * health/death, `PatrolComponent` for movement, and a single `ContactDamageComponent`
 * (trigger hurtbox + contact damage). Actor Inspector knobs are the source of truth and sync
 * into those components at runtime. Reports defeat to `GameState` (gates the exit) and stays
 * defeated across player respawns.
 *
 * Embedded spider clips (`Idle01` / `Walk01` / `Gethit01` / `Death01`) are driven by
 * `AnimationStateMachineComponent` + `@project/assets/models/enemy/spider.animconfig.json`.
 * After the death clip, the corpse lingers, then despawns with a configurable VFX + scale fade.
 */
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { ContactDamageComponent } from '../combat/ContactDamageComponent.js';
import { Action2DGameMode } from '../core/Action2DGameMode.js';
import { feedback } from '../core/FeedbackEvents.js';
import { ENEMY_NEARBY_SOUND_URL } from '../feel/SoundFeedbackBinder.js';

import { PatrolComponent } from './PatrolComponent.js';

const ENEMY_MODEL_URL = '@engine/assets/models/demo/SandboxAsset/Characters/SKM_Arachnids_Large_Spider.glb';
const ENEMY_ANIM_CONFIG_URL = '@project/assets/models/enemy/spider.animconfig.json';
const DEFAULT_DEATH_VFX = '@project/assets/vfx/spider-death-poof.vfx.json';
/** Fallback if the death clip action never finishes (seconds). */
const DEATH_CLIP_FALLBACK_SECONDS = 1.25;

export interface EnemyActorOptions extends ENGINE.SceneNodeOptions {
  health?: number;
  contactDamage?: number;
  moveSpeed?: number;
  patrolRange?: number;
  /** Stable id used for defeat tracking; defaults to the actor uuid. */
  enemyId?: string;
  /** Uniform scale applied to the visual model. */
  visualScale?: number;
  /** Vertical offset so the model's feet rest on the ground. */
  visualOffsetY?: number;
  /** Seconds the patrol freezes after a hit (0 = no stun). */
  hitStunDuration?: number;
  /** World units shoved away from the player on hit (0 = no knockback). */
  knockbackDistance?: number;
  /** Seconds over which knockback distance is applied. */
  knockbackDuration?: number;
  /** Seconds the corpse stays after the death clip before despawn. */
  corpseLingerDuration?: number;
  /** Seconds to scale the mesh down during despawn. */
  despawnFadeDuration?: number;
  /** Play a particle burst when the corpse despawns. */
  deathVfxEnabled?: boolean;
  /** VFX JSON path for the despawn burst. */
  deathVfxPath?: string;
}

@ENGINE.GameClass()
export class EnemyActor extends ENGINE.SceneNode {
  private enemyId = '';
  private visualScale = 1;
  private visualOffsetY = 0;

  @ENGINE.property({
    type: 'number',
    category: 'Combat',
    min: 1,
    max: 500,
    step: 1,
    description: 'Maximum hit points for this enemy.',
  })
  public maxHealth = 60;

  @ENGINE.property({
    type: 'number',
    category: 'Combat',
    min: 0,
    max: 200,
    step: 1,
    description: 'Damage dealt to the player on body contact each tick while overlapping.',
  })
  public contactDamage = 20;

  @ENGINE.property({
    type: 'number',
    category: 'Patrol',
    min: 0,
    max: 20,
    step: 0.1,
    description: 'Horizontal patrol speed (units/s).',
  })
  public moveSpeed = 2.5;

  @ENGINE.property({
    type: 'number',
    category: 'Patrol',
    min: 0,
    max: 30,
    step: 0.1,
    description: 'Half-width of the patrol span from spawn X (units).',
  })
  public patrolRange = 3;

  @ENGINE.property({
    type: 'number',
    category: 'Hit Reaction',
    min: 0,
    max: 2,
    step: 0.05,
    description: 'Seconds patrol freezes after taking damage (0 disables).',
  })
  public hitStunDuration = 0.55;

  @ENGINE.property({
    type: 'number',
    category: 'Hit Reaction',
    min: 0,
    max: 3,
    step: 0.05,
    description: 'World units shoved away from the player on hit (0 disables).',
  })
  public knockbackDistance = 0.7;

  @ENGINE.property({
    type: 'number',
    category: 'Hit Reaction',
    min: 0.05,
    max: 1,
    step: 0.01,
    description: 'Seconds over which knockback distance is applied.',
  })
  public knockbackDuration = 0.12;

  @ENGINE.property({
    type: 'number',
    category: 'Death',
    min: 0,
    max: 5,
    step: 0.05,
    description: 'Seconds the corpse stays after the death clip before despawning.',
  })
  public corpseLingerDuration = 0.75;

  @ENGINE.property({
    type: 'number',
    category: 'Death',
    min: 0.05,
    max: 2,
    step: 0.05,
    description: 'Seconds to shrink the mesh during despawn.',
  })
  public despawnFadeDuration = 0.45;

  @ENGINE.property({
    type: 'boolean',
    category: 'Death',
    description: 'Play a particle burst when the corpse despawns.',
  })
  public deathVfxEnabled = true;

  @ENGINE.property({
    type: 'vfxPath',
    category: 'Death',
    description: 'VFX JSON path for the despawn burst (@project / @engine).',
  })
  public deathVfxPath = DEFAULT_DEATH_VFX;

  private stats!: EnemyStatsComponent;
  private patrol!: PatrolComponent;
  private nearbySound: ENGINE.SoundNode | null = null;
  private visual!: ENGINE.ModelMeshNode;
  private animation!: ENGINE.AnimationStateMachineNode;
  /** Combat volume: player attacks hit this; overlapping the player deals contact damage. */
  private hurtbox!: ContactDamageComponent;

  private previousHealth = 0;
  private defeated = false;
  private deathSequenceStarted = false;
  private despawning = false;
  private despawnFadeElapsed = 0;
  private readonly visualBaseScale = new THREE.Vector3(1, 1, 1);

  constructor() {
    super();
    this.isRoot = true;
  }

  public override initialize(options?: EnemyActorOptions): void {
    super.initialize(options);

    this.maxHealth = options?.health ?? this.maxHealth;
    this.contactDamage = options?.contactDamage ?? this.contactDamage;
    this.moveSpeed = options?.moveSpeed ?? this.moveSpeed;
    this.patrolRange = options?.patrolRange ?? this.patrolRange;
    this.enemyId = options?.enemyId ?? this.enemyId;
    this.visualScale = options?.visualScale ?? this.visualScale;
    this.visualOffsetY = options?.visualOffsetY ?? this.visualOffsetY;
    this.hitStunDuration = options?.hitStunDuration ?? this.hitStunDuration;
    this.knockbackDistance = options?.knockbackDistance ?? this.knockbackDistance;
    this.knockbackDuration = options?.knockbackDuration ?? this.knockbackDuration;
    this.corpseLingerDuration = options?.corpseLingerDuration ?? this.corpseLingerDuration;
    this.despawnFadeDuration = options?.despawnFadeDuration ?? this.despawnFadeDuration;
    this.deathVfxEnabled = options?.deathVfxEnabled ?? this.deathVfxEnabled;
    this.deathVfxPath = options?.deathVfxPath ?? this.deathVfxPath;

    this.visual = ENGINE.ModelMeshNode.create({
      name: 'EnemyVisual',
      modelUrl: ENEMY_MODEL_URL,
      scale: new THREE.Vector3(this.visualScale, this.visualScale, this.visualScale),
      position: new THREE.Vector3(0, this.visualOffsetY, 0),
      physicsOptions: { enabled: false },
      castShadow: true,
    });
    this.add(this.visual);
    this.visualBaseScale.set(this.visualScale, this.visualScale, this.visualScale);

    this.animation = ENGINE.AnimationStateMachineNode.create({
      name: 'EnemyAnimation',
      configUrl: ENEMY_ANIM_CONFIG_URL,
    });
    this.add(this.animation);

    // One combat node: trigger shape (player attack target) + contact damage while overlapping.
    // Sensor -> the KCC passes through it, so it never blocks the player.
    this.hurtbox = ContactDamageComponent.create({
      name: 'EnemyHurtbox',
      geometry: new THREE.SphereGeometry(0.8),
      position: new THREE.Vector3(0, 0.4, 0),
      damage: this.contactDamage,
    });
    this.add(this.hurtbox);

    this.stats = EnemyStatsComponent.create({
      name: 'EnemyStats',
      maxHealth: this.maxHealth,
      healthRegen: 0,
    });
    this.stats.host = this;
    this.add(this.stats);

    this.patrol = PatrolComponent.create({
      name: 'EnemyPatrol',
      speed: this.moveSpeed,
      range: this.patrolRange,
    });
    this.add(this.patrol);

    // Soft positional chitter — audible when the player is nearby (distance attenuated).
    const nearbyClip = new ENGINE.SoundResource();
    nearbyClip.name = 'nearby';
    nearbyClip.audioPath = ENEMY_NEARBY_SOUND_URL;
    nearbyClip.volume = 0.4;
    nearbyClip.refDistance = 2.5;
    nearbyClip.maxDistance = 14;
    nearbyClip.rolloffFactor = 2.2;
    nearbyClip.distanceModel = 'linear';
    this.nearbySound = ENGINE.SoundNode.create({
      name: 'EnemyNearbySound',
      sounds: [nearbyClip],
      loop: true,
      positional: true,
      autoPlay: true,
      autoPlayClipKey: 'nearby',
    });
    this.add(this.nearbySound);
  }

  public override beginPlay(): boolean {
    // Swap/bind children before entering play — SceneNode remove/add while Playing
    // trips beginPlay/endPlay PlayState ensures.
    this.bindRuntimeComponents();

    if (!super.beginPlay()) {
      return false;
    }

    this.visualBaseScale.copy(this.visual.scale);

    this.previousHealth = this.stats.getCurrentHealth();
    if (!this.enemyId) this.enemyId = this.uuid;

    const gameState = Action2DGameMode.get(this.getWorld())?.gameState;
    if (gameState) {
      gameState.registerEnemy(this.enemyId);
      // Stay defeated across respawns / re-entry.
      if (gameState.isEnemyDefeated(this.enemyId)) {
        this.destroy();
        return true;
      }
    }

    this.stats.onHealthChanged.add((current) => this.onHealthChanged(current));
    this.stats.onDeath.add(() => this.onDefeated());
    return true;
  }

  public override tickPostPhysics(deltaTime: number): void {
    super.tickPostPhysics(deltaTime);

    // Keep sibling components aligned with Inspector knobs during Play.
    this.patrol.setSpeed(this.moveSpeed);
    this.patrol.setRange(this.patrolRange);
    this.hurtbox?.setDamage(this.contactDamage);
    if (this.stats && this.stats.getMaxHealth() !== this.maxHealth) {
      this.stats.setMaxHealth(this.maxHealth);
    }

    if (this.despawning) {
      this.tickDespawnFade(deltaTime);
      return;
    }

    if (this.defeated) return;

    // Model faces -Z; yaw -90° looks toward +X (right), +90° toward -X (left).
    const dir = this.patrol.getDirection();
    this.visual.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;

    if (this.animation.isReady()) {
      // Freeze locomotion during hit-stun so Walk does not override the hit clip.
      this.animation.setParameter('moving', !this.patrol.isStunned());
    }
  }

  /**
   * Delay destroy so death anim + corpse linger + despawn VFX can play.
   * Invoked from {@link EnemyStatsComponent.handleDeath} instead of immediate root destroy.
   */
  public beginDeathSequence(_hitInfo?: ENGINE.DamageHitInfo): void {
    if (this.deathSequenceStarted) return;
    this.deathSequenceStarted = true;
    this.patrol.setTickEnabled(false);
    this.disableCombatPresence();
    void this.playDeathThenDestroy();
  }

  private bindRuntimeComponents(): void {
    this.visual = this.getNode(ENGINE.ModelMeshNode) ?? this.visual;
    const existingStats = this.getNode(EnemyStatsComponent)
      ?? this.getNode(ENGINE.CharacterStatsNode);
    if (existingStats instanceof EnemyStatsComponent) {
      this.stats = existingStats;
    } else if (existingStats) {
      // Scene instances may still carry a plain CharacterStatsComponent — replace so death
      // runs the corpse sequence instead of an immediate root destroy.
      const maxHealth = existingStats.getMaxHealth();
      existingStats.removeFromParent();
      this.stats = EnemyStatsComponent.create({
        name: 'EnemyStats',
        maxHealth,
        healthRegen: 0,
      });
      this.add(this.stats);
    }
    this.stats.host = this;
    this.patrol = this.getNode(PatrolComponent) ?? this.patrol;

    const existingContact = this.getNode(ContactDamageComponent);
    if (existingContact) {
      this.hurtbox = existingContact;
    } else {
      // Prefab/scene predating the unified combat node: attach ContactDamage and disable
      // any leftover plain CollisionShape hurtbox so we don't double-trigger.
      for (const shape of this.getNodes(ENGINE.CollisionShapeNode)) {
        if (shape instanceof ContactDamageComponent) continue;
        shape.overridePhysicsOptions({ enabled: false });
        shape.setTickEnabled(false);
      }
      this.hurtbox = ContactDamageComponent.create({
        name: 'EnemyHurtbox',
        damage: this.contactDamage,
      });
      this.add(this.hurtbox);
    }

    const existingAnim = this.getNode(ENGINE.AnimationStateMachineNode);
    if (existingAnim) {
      this.animation = existingAnim;
      return;
    }

    // Late attach for scene instances saved before animation was wired.
    // Added before beginPlay so Object3D.add does not auto-beginPlay mid-lifecycle.
    this.animation = ENGINE.AnimationStateMachineNode.create({
      name: 'EnemyAnimation',
      configUrl: ENEMY_ANIM_CONFIG_URL,
    });
    this.add(this.animation);
  }

  private onHealthChanged(current: number): void {
    if (current < this.previousHealth && current > 0) {
      feedback.emit('enemyDamage', {
        amount: this.previousHealth - current,
        position: this.getWorldPosition().clone(),
      });
      this.applyHitReaction();
      // Avoid playOneShot — engine OneShotHost is incomplete (getOneShotClips missing).
      if (this.animation.isReady()) {
        this.animation.transitionGraphToState('base', 'hit');
      }
    }
    this.previousHealth = current;
  }

  private applyHitReaction(): void {
    const stun = Math.max(0, this.hitStunDuration);
    const distance = Math.max(0, this.knockbackDistance);
    const duration = Math.max(0.05, this.knockbackDuration);
    if (stun <= 0 && distance <= 0) return;

    this.patrol.applyHitReaction(stun, distance, duration, this.resolveKnockbackSign());
  }

  /** Push away from the player on X; fall back to opposite patrol direction. */
  private resolveKnockbackSign(): number {
    const player = Action2DGameMode.get(this.getWorld())?.getPlayerPawn();
    if (player) {
      const dx = this.getWorldPosition().x - player.getWorldPosition().x;
      if (Math.abs(dx) > 1e-4) return Math.sign(dx);
    }
    return -this.patrol.getDirection();
  }

  private onDefeated(): void {
    if (this.defeated) return;
    this.defeated = true;
    feedback.emit('enemyDeath', { position: this.getWorldPosition().clone() });
    Action2DGameMode.get(this.getWorld())?.gameState.markEnemyDefeated(this.enemyId);
  }

  private disableCombatPresence(): void {
    this.hurtbox.overridePhysicsOptions({ enabled: false });
    this.hurtbox.setTickEnabled(false);
    this.nearbySound?.stop();
  }

  private async playDeathThenDestroy(): Promise<void> {
    if (this.animation.isReady()) {
      this.animation.transitionGraphToState('base', 'die');
      await this.waitForClipFinished('Death01', DEATH_CLIP_FALLBACK_SECONDS);
    }

    const linger = Math.max(0, this.corpseLingerDuration);
    if (linger > 0) {
      await this.waitSeconds(linger);
    }

    await this.beginDespawn();
  }

  private async beginDespawn(): Promise<void> {
    this.despawning = true;
    this.despawnFadeElapsed = 0;
    this.visualBaseScale.copy(this.visual.scale);
    // Generic hub event — SoundFeedbackBinder (or any game) can react without knowing EnemyActor.
    feedback.emit('despawn', { position: this.getWorldPosition().clone() });
    await this.playDeathVfx();

    const fade = Math.max(0.05, this.despawnFadeDuration);
    // Keep the actor alive a bit past the fade so burst particles can finish.
    await this.waitSeconds(fade + 0.7);
    this.destroy();
  }

  private tickDespawnFade(deltaTime: number): void {
    const fade = Math.max(0.05, this.despawnFadeDuration);
    this.despawnFadeElapsed += deltaTime;
    const t = Math.min(1, this.despawnFadeElapsed / fade);
    // Ease-in shrink so the poof reads as a sudden vanish at the end.
    const scaleMul = Math.max(0.001, 1 - t * t);
    this.visual.scale.set(
      this.visualBaseScale.x * scaleMul,
      this.visualBaseScale.y * scaleMul,
      this.visualBaseScale.z * scaleMul,
    );
    // Sink slightly so the vanish reads even if bone anim fights uniform scale.
    this.visual.position.y = this.visualOffsetY - t * 0.35;
    if (t >= 1) {
      this.visual.visible = false;
    }
  }

  private async playDeathVfx(): Promise<void> {
    if (!this.deathVfxEnabled || !this.deathVfxPath) return;

    const world = this.getWorld();
    if (!world) return;

    // World-space spawn (not parented to this actor) so shrink/destroy cannot hide the burst.
    const position = this.getWorldPosition().clone();
    position.y += 0.35;
    try {
      await world.globalParticleManager.spawnVFXFromPath(this.deathVfxPath, {
        position,
        scale: new THREE.Vector3(1.4, 1.4, 1.4),
      });
    } catch (error) {
      console.warn('[EnemyActor] Failed to spawn death VFX:', error);
    }
  }

  private waitSeconds(seconds: number): Promise<void> {
    return new Promise((resolve) => {
      const world = this.getWorld();
      if (!world || seconds <= 0) {
        resolve();
        return;
      }
      world.timerSystem.setTimeout(() => resolve(), seconds);
    });
  }

  private waitForClipFinished(clipName: string, fallbackSeconds: number): Promise<void> {
    const action = this.animation.getActionsMap().get(clipName);
    if (!action) {
      return this.waitSeconds(fallbackSeconds);
    }

    return new Promise((resolve) => {
      const mixer = action.getMixer();
      const world = this.getWorld();
      let settled = false;
      let timeoutId: number | null = null;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        mixer.removeEventListener('finished', onFinished);
        if (timeoutId !== null) world?.timerSystem.clearTimer(timeoutId);
        resolve();
      };
      const onFinished = (event: { action?: THREE.AnimationAction }): void => {
        if (event.action === action) finish();
      };
      mixer.addEventListener('finished', onFinished);
      if (world) {
        timeoutId = world.timerSystem.setTimeout(finish, fallbackSeconds);
      } else {
        window.setTimeout(finish, fallbackSeconds * 1000);
      }
    });
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_Character';
  }
}

/**
 * Enemy health that starts the corpse/despawn sequence instead of destroying the root
 * immediately (engine CharacterStatsNode default).
 */
@ENGINE.GameClass()
class EnemyStatsComponent extends ENGINE.CharacterStatsNode {
  public host: EnemyActor | null = null;

  protected override handleDeath(hitInfo?: ENGINE.DamageHitInfo): void {
    this.host?.beginDeathSequence(hitInfo);
  }
}
