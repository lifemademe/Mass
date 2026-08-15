/**
 * PlatformerPawn - the side-on player character.
 *
 * Assembles: an invisible kinematic capsule collider child (required by the Mover KCC; the pawn
 * owns the rigid body), a mannequin visual + Odyssey-style animation graph, an
 * `EquippedWeaponComponent` (sword on hand socket), a `MoverComponent` running the custom
 * platformer ground/air modes, a `PlayerHealthComponent`, an `AttackComponent`, and the
 * `SideScrollCameraComponent`.
 */
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { PlayerAnimationController } from '../animation/PlayerAnimationController.js';
import { PlayerAnimationSettingsComponent } from '../animation/PlayerAnimationSettingsComponent.js';
import { SideScrollCameraComponent } from '../camera/SideScrollCameraComponent.js';
import { AttackComponent } from '../combat/AttackComponent.js';
import { EquippedWeaponComponent } from '../combat/EquippedWeaponComponent.js';
import { Action2DGameMode } from '../core/Action2DGameMode.js';
import { feedback } from '../core/FeedbackEvents.js';
import { combatFeel } from '../feel/CombatFeel.js';
import { PlatformerAirMode } from '../movement/PlatformerAirMode.js';
import { PlatformerGroundMode } from '../movement/PlatformerGroundMode.js';
import { PlatformerMovementSettingsComponent } from '../movement/PlatformerMovementSettingsComponent.js';
import { AIR_MODE_NAME, GROUND_MODE_NAME, getPlatformerFacing, resetPlatformerState } from '../movement/PlatformerModeShared.js';

import { PlatformerPlayerController } from './PlatformerPlayerController.js';
import { PlayerHealthComponent } from './PlayerHealthComponent.js';

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.45;
/** Half capsule height — spawn/respawn markers sit on the floor; the pawn origin is the capsule center. */
export const PLATFORMER_COLLIDER_HALF_HEIGHT = PLAYER_HEIGHT / 2;

const PLAYER_ANIM_CONFIG_URL = '@project/assets/models/character/mannequin.animconfig.json';

@ENGINE.GameClass()
export class PlatformerPawn extends ENGINE.Pawn {
  private mover!: ENGINE.MoverNode;
  private visual!: ENGINE.ModelMeshNode;
  private animation!: ENGINE.AnimationStateMachineNode;
  private weapon!: EquippedWeaponComponent;
  private health!: PlayerHealthComponent;
  private attack!: AttackComponent;
  private cameraComponent!: SideScrollCameraComponent;
  private animController: PlayerAnimationController | null = null;

  /**
   * Yaw when facing +X (screen right). Mannequin rests facing −Z at yaw 0; +π/2 aims +X
   * so the side-scroll camera on +Z sees a profile (and run cycles match travel direction).
   */
  private readonly baseYaw = Math.PI / 2;

  public override initialize(options?: ENGINE.PawnOptions): void {
    const collider = this.createCollider();
    super.initialize({
      ...options,
      children: [collider, ...(options?.children ?? [])],
      // Compound physics: the pawn owns the kinematic body; capsule child contributes the collider.
      physicsOptions: {
        enabled: true,
        motionType: ENGINE.PhysicsMotionType.KinematicPositionBased,
        collisionProfile: ENGINE.DefaultCollisionProfile.Character,
        ...options?.physicsOptions,
      },
    });

    this.add(PlatformerMovementSettingsComponent.create({ name: 'PlayerMovement' }));
    this.add(PlayerAnimationSettingsComponent.create({ name: 'PlayerAnimSettings' }));

    this.mover = this.createMover();
    this.add(this.mover);

    this.animation = ENGINE.AnimationStateMachineNode.create({
      name: 'PlayerAnimation',
      configUrl: PLAYER_ANIM_CONFIG_URL,
    });
    this.add(this.animation);

    this.visual = ENGINE.ModelMeshNode.create({
      name: 'PlayerVisual',
      modelUrl: ENGINE.DEFAULT_CHARACTER_MODEL_URL,
      position: new THREE.Vector3(0, -PLAYER_HEIGHT / 2, 0),
      rotation: new THREE.Euler(0, this.baseYaw, 0),
      physicsOptions: { enabled: false },
      castShadow: true,
      // Pre-declare hand socket so EquippedWeaponComponent does not mutate sockets at runtime
      // (inspector socket rebuilds on selection were orphaning the weapon mesh).
      sockets: [
        {
          name: 'RightHand',
          boneName: 'mixamorigRightHand',
          offsetLocation: new THREE.Vector3(-0.37, -0.16, 0.06),
          offsetRotation: new THREE.Euler(0, 0, -1.047198),
          offsetScale: new THREE.Vector3(2, 2, 2),
        },
      ],
    });
    this.add(this.visual);

    // Grip offsets / model live on this component so they can be tuned in the editor.
    this.weapon = EquippedWeaponComponent.create({ name: 'PlayerWeapon' });
    this.add(this.weapon);

    this.health = PlayerHealthComponent.create({ name: 'PlayerHealth', maxHealth: 100, invulnDuration: 1.0 });
    this.add(this.health);

    this.attack = AttackComponent.create({ name: 'PlayerAttack' });
    this.add(this.attack);

    this.cameraComponent = SideScrollCameraComponent.create({ name: 'PlayerCamera' });
    this.add(this.cameraComponent);
  }

  private createCollider(): ENGINE.SceneNode {
    return ENGINE.MeshNode.create({
      name: 'PlayerCollider',
      geometry: new THREE.CapsuleGeometry(PLAYER_RADIUS, PLAYER_HEIGHT - PLAYER_RADIUS * 2),
      selfHidden: true,
      physicsOptions: {
        enabled: true,
        contributeToParentCollider: true,
      },
    });
  }

  private createMover(): ENGINE.MoverNode {
    const mover = ENGINE.MoverNode.create({ name: 'MoverComponent' });
    // Modes resolve live knobs from PlatformerMovementSettingsComponent each tick.
    mover.addMovementMode(GROUND_MODE_NAME, new PlatformerGroundMode(undefined));
    mover.addMovementMode(AIR_MODE_NAME, new PlatformerAirMode(undefined));
    mover.startingModeName = GROUND_MODE_NAME;
    return mover;
  }

  public getMover(): ENGINE.MoverNode {
    return this.mover;
  }

  public getHealth(): PlayerHealthComponent {
    return this.health;
  }

  public getAttack(): AttackComponent {
    return this.attack;
  }

  public getWeapon(): EquippedWeaponComponent {
    return this.weapon;
  }

  public getCameraComponent(): SideScrollCameraComponent {
    return this.cameraComponent;
  }

  public getAnimationController(): PlayerAnimationController | null {
    return this.animController;
  }

  public override beginPlay(): boolean {
    // Prefab spawn deserializes children and skips initialize() — rebind fields and
    // re-register mover modes (modes are code-only, not serialized) before play.
    this.bindRuntimeComponents();

    if (!super.beginPlay()) {
      return false;
    }

    this.animController ??= new PlayerAnimationController(this);
    this.animController.attach();
    this.animController.onFootstep.add(() => {
      feedback.emit('footstep', { position: this.getWorldPosition().clone() });
    });
    this.weapon.setAnimationController(this.animController);

    Action2DGameMode.get(this.getWorld())?.registerPlayerPawn(this);

    this.onPossessed.add((_pawn, controller) => this.wireController(controller));
    const current = this.getController();
    if (current) this.wireController(current);
    return true;
  }

  public override endPlay(): boolean {
    if (!super.endPlay()) {
      return false;
    }
    this.weapon?.setAnimationController(null);
    this.animController?.detach();
    this.animController = null;
    return true;
  }

  /**
   * Resolve children after prefab/scene deserialize. `initialize()` only runs for
   * `PlatformerPawn.create()` — prefab spawn uses `new` + JSON children, so private
   * fields and non-serialized mover modes must be wired here.
   */
  private bindRuntimeComponents(): void {
    this.mover = this.getNode(ENGINE.MoverNode) ?? this.mover;
    this.animation = this.getNode(ENGINE.AnimationStateMachineNode) ?? this.animation;
    this.visual = this.getNodes(ENGINE.ModelMeshNode).find((m) => m.name === 'PlayerVisual')
      ?? this.visual;
    this.weapon = this.getNode(EquippedWeaponComponent) ?? this.weapon;
    this.health = this.getNode(PlayerHealthComponent) ?? this.health;
    this.attack = this.getNode(AttackComponent) ?? this.attack;
    this.cameraComponent = this.getNode(SideScrollCameraComponent) ?? this.cameraComponent;

    if (!this.mover || !this.animation || !this.visual || !this.weapon
      || !this.health || !this.attack || !this.cameraComponent) {
      throw new Error(
        'PlatformerPawn: missing required child after prefab/scene bind '
        + '(expected Mover, PlayerAnimation, PlayerVisual, PlayerWeapon, '
        + 'PlayerHealth, PlayerAttack, PlayerCamera).',
      );
    }

    this.ensureMoverModes(this.mover);
  }

  /** Movement modes are runtime-only; re-register when the mover came from a prefab. */
  private ensureMoverModes(mover: ENGINE.MoverNode): void {
    // addMovementMode overwrites by name — safe to call every beginPlay.
    mover.addMovementMode(GROUND_MODE_NAME, new PlatformerGroundMode(undefined));
    mover.addMovementMode(AIR_MODE_NAME, new PlatformerAirMode(undefined));
    mover.startingModeName = GROUND_MODE_NAME;
  }

  private wireController(controller: ENGINE.Controller): void {
    if (!(controller instanceof PlatformerPlayerController)) return;
    controller.onAttack.add(() => {
      // No swings while dead — R still reaches respawn via onRespawnRequested.
      if (this.health.getIsDead()) return;
      this.attack.tryAttack();
    });
    controller.onRespawnRequested.add(() => Action2DGameMode.get(this.getWorld())?.handleRespawnInput());
  }

  public override tickPostPhysics(deltaTime: number): void {
    super.tickPostPhysics(deltaTime);
    const facing = getPlatformerFacing(this.mover);
    this.visual.rotation.y = facing > 0 ? this.baseYaw : this.baseYaw + Math.PI;

    // Dead: stay fully visible (no invuln blink on the corpse). Alive: blink body + sword together.
    if (this.health.getIsDead()) {
      if (combatFeel.isBlinking()) combatFeel.endDamageBlink();
      this.visual.visible = true;
      this.weapon.setRenderVisible(true);
    } else {
      const vis = !combatFeel.isBlinking() || combatFeel.isBlinkVisible();
      this.visual.visible = vis;
      this.weapon.setRenderVisible(vis);
    }

    if (!combatFeel.isFrozen() && this.animation.isReady() && this.animController) {
      this.animation.setParameter(this.animController.update(deltaTime));
    }
  }

  /** Teleport to a respawn transform, restoring health, clearing momentum, snapping the camera. */
  public resetForRespawn(position: THREE.Vector3, rotation: THREE.Euler): void {
    resetPlatformerState(this.mover, position, rotation);
    this.setWorldPosition(position);
    this.setWorldRotation(rotation);

    // KCC reads the physics body, not the scene transform — without an immediate teleport the
    // next move still starts from the death location / a stale pose and can leave the capsule
    // intersecting the floor at the respawn point.
    const quat = new THREE.Quaternion().setFromEuler(rotation);
    this.getPhysicsEngine()?.teleportBody(this, position, quat);

    this.health.revive();
    combatFeel.endDamageBlink();
    this.visual.visible = true;
    this.weapon.setRenderVisible(true);
    this.cameraComponent.resetToTarget();
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_Character';
  }
}
