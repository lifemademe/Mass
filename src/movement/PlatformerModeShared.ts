/**
 * PlatformerModeShared - shared simulation for the 2D platformer movement modes.
 *
 * `PlatformerGroundMode` and `PlatformerAirMode` both extend `PlatformerModeBase`, which
 * drives the same Rapier kinematic character controller (via `CharacterMovementShared`)
 * and implements the platformer feel the shipped Walking/Falling modes lack:
 *   - variable jump height (jump cut on early release)
 *   - coyote time (jump shortly after leaving a ledge)
 *   - jump input buffering (jump pressed shortly before landing)
 *   - separate rising/falling gravity
 *   - locked Z plane + facing stored for the visual to flip toward
 *
 * Cross-mode state (vertical velocity, timers, facing) lives in `MovementSyncState.custom`
 * so it survives the ground <-> air transitions.
 */
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { AttackComponent } from '../combat/AttackComponent.js';
import { feedback } from '../core/FeedbackEvents.js';
import { combatFeel } from '../feel/CombatFeel.js';
import { PlayerHealthComponent } from '../player/PlayerHealthComponent.js';

import type { PlatformerMovementConfig } from './PlatformerMovementConfig.js';
import { defaultPlatformerMovementConfig } from './PlatformerMovementConfig.js';
import { PlatformerMovementSettingsComponent } from './PlatformerMovementSettingsComponent.js';

export const GROUND_MODE_NAME = 'platformerGround';
export const AIR_MODE_NAME = 'platformerAir';

const KEY_COYOTE = 'platformer.coyoteTimer';
const KEY_BUFFER = 'platformer.jumpBufferTimer';
const KEY_JUMPING = 'platformer.jumping';
const KEY_FACING = 'platformer.facing';
const KEY_DEBUG = 'platformer.debug';

/** Per-tick KCC/mover debug sample (optional — read by `src/debug/PlatformerDebugHud.ts`). */
export interface PlatformerDebugSnapshot {
  mode: string;
  vx: number;
  vy: number;
  posX: number;
  posY: number;
  moveX: number;
  jumpPressed: boolean;
  /** Raw `computeCharacterMovement().isGrounded` (includes voxel wall-slide workaround). */
  kccGrounded: boolean;
  hitGround: boolean;
  hitCeiling: boolean;
  /** Grounded after gameplay filters (hitGround / kcc stick + rising-jump ignore). */
  groundedApplied: boolean;
  jumping: boolean;
  coyote: number;
  buffer: number;
  facing: number;
  reqDx: number;
  reqDy: number;
  actDx: number;
  actDy: number;
  blockedX: boolean;
  blockedUp: boolean;
  blockedDown: boolean;
  /** Vertical almost fully blocked while falling, and not also wall-blocked. */
  heurGround: boolean;
  /** Vertical almost fully blocked while rising, and not also wall-blocked. */
  heurCeiling: boolean;
  tags: string;
}

type CharacterControllerOptions = ReturnType<typeof ENGINE.defaultCharacterControllerOptions>;

/** Reads the current facing (+1 right, -1 left) the platformer modes stored on the mover. */
export function getPlatformerFacing(mover: ENGINE.MoverNode): number {
  const facing = mover.getSyncState().custom.get<number>(KEY_FACING);
  return facing === -1 ? -1 : 1;
}

/** Latest debug snapshot written by the active platformer mode, or null. */
export function getPlatformerDebugSnapshot(mover: ENGINE.MoverNode): PlatformerDebugSnapshot | null {
  return mover.getSyncState().custom.get<PlatformerDebugSnapshot>(KEY_DEBUG) ?? null;
}

/**
 * Hard-resets the mover's live sync state to a new transform, clearing velocity and all
 * platformer timers. Used for checkpoint respawn so the character doesn't carry momentum
 * or a stale jump/coyote state across the teleport.
 */
export function resetPlatformerState(
  mover: ENGINE.MoverNode,
  position: THREE.Vector3,
  rotation: THREE.Euler,
): void {
  const sync = mover.getSyncState() as ENGINE.MovementSyncState;
  sync.position.copy(position);
  sync.rotation.copy(rotation);
  sync.velocity.set(0, 0, 0);
  ENGINE.setVerticalVelocity(sync, 0);
  sync.custom.set(KEY_COYOTE, 0);
  sync.custom.set(KEY_BUFFER, 999);
  sync.custom.set(KEY_JUMPING, false);
  sync.custom.set(KEY_FACING, 1);
}

function moveToward(current: number, target: number, maxDelta: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

/**
 * True when this tick's intended axis displacement was significantly clipped by the KCC.
 *
 * - `reqMin`: ignore near-zero intended moves (no signal).
 * - `remainRatio`: actual/requested below this ⇒ blocked (0.35 ≈ ≥65% eaten; was 0.1 / 90%).
 * - `clipMin`: require a minimum absolute clip so float noise doesn't trip the flag.
 */
function isAxisBlocked(
  requested: number,
  actual: number,
  reqMin = 1e-4,
  remainRatio = 0.35,
  clipMin = 1e-5,
): boolean {
  const ar = Math.abs(requested);
  const aa = Math.abs(actual);
  if (ar < reqMin) return false;
  return aa / ar < remainRatio && ar - aa >= clipMin;
}

/** Transition that switches modes based on the shared KCC grounded tag. */
class GroundedTagTransition implements ENGINE.IMoverTransition {
  constructor(private readonly targetMode: string, private readonly whenGrounded: boolean) {}

  public evaluate(_startData: ENGINE.MoverTickStartData, mover: ENGINE.MoverNode): string | null {
    const grounded = mover.hasSyncTag(ENGINE.GROUNDED_TAG, true);
    return grounded === this.whenGrounded ? this.targetMode : null;
  }
}

export abstract class PlatformerModeBase implements ENGINE.IMovementMode {
  public readonly transitions: ENGINE.IMoverTransition[];

  protected readonly controllerOptions: CharacterControllerOptions;
  private readonly fallbackConfig: PlatformerMovementConfig;
  private activeMover: ENGINE.MoverNode | null = null;

  constructor(config: PlatformerMovementConfig | undefined, targetMode: string, targetWhenGrounded: boolean) {
    this.fallbackConfig = config ?? defaultPlatformerMovementConfig();
    this.transitions = [new GroundedTagTransition(targetMode, targetWhenGrounded)];
    this.controllerOptions = {
      ...ENGINE.defaultCharacterControllerOptions(),
      // Gravity is integrated manually below, so the KCC must not add its own.
      simulatedGravityScale: 0,
      // No snap-to-ground: near platform edges Rapier's snap keeps reporting grounded /
      // pulls the character down on the jump frame, which eats vy and feels like the
      // ledge "braked" the jump. Ground contact still comes from computedGrounded().
      snapToGroundDistance: undefined,
      // Disable auto-step: on box platforms it makes the character catch/stutter on vertical
      // edges (trying to climb the side) instead of cleanly sliding or falling. Jumps handle
      // vertical traversal in a 2D platformer.
      autoStepConfig: undefined,
    };
  }

  /** True for the grounded mode, false for the airborne mode. */
  protected abstract isGround(): boolean;

  /** Live settings from the pawn when present; otherwise constructor/fallback defaults. */
  protected resolveConfig(mover?: ENGINE.MoverNode | null): PlatformerMovementConfig {
    const host = mover ?? this.activeMover;
    const settings = host?.getRoot()?.getNode(PlatformerMovementSettingsComponent);
    return settings?.toConfig() ?? this.fallbackConfig;
  }

  public onActivate(mover: ENGINE.MoverNode): void {
    this.activeMover = mover;
    ENGINE.ensureCharacterController(mover, this.controllerOptions);
  }

  public onDeactivate(_mover: ENGINE.MoverNode): void {
    this.activeMover = null;
  }

  public cleanup(mover: ENGINE.MoverNode): void {
    this.activeMover = null;
    ENGINE.releaseCharacterController(mover);
  }

  public generateMove(startData: ENGINE.MoverTickStartData, _timeStep: ENGINE.MoverTimeStep): ENGINE.ProposedMove {
    const cfg = this.resolveConfig();
    const targetX = THREE.MathUtils.clamp(startData.inputCmd.moveInput.x, -1, 1) * cfg.moveSpeed;
    return {
      velocity: new THREE.Vector3(targetX, 0, 0),
      mixMode: ENGINE.MoveMixMode.Override,
    };
  }

  public simulationTick(params: ENGINE.SimulationTickParams): ENGINE.MoverTickEndData {
    const { startData, proposedMove, timeStep, mover } = params;
    this.activeMover = mover;
    const cfg = this.resolveConfig(mover);
    // Hit-stop: keep pose/velocity, skip sim integration for this step.
    if (combatFeel.isFrozen()) {
      const sync = ENGINE.cloneSyncState(startData.syncState);
      const auxState = { custom: startData.auxState.custom.clone() };
      return { syncState: sync, auxState };
    }
    const dt = Math.min(timeStep.stepMs / 1000, 0.1);

    const sync = ENGINE.cloneSyncState(startData.syncState);
    const auxState = { custom: startData.auxState.custom.clone() };
    const input = startData.inputCmd;

    const wasGrounded = startData.syncState.tags.includes(ENGINE.GROUNDED_TAG);
    const health = mover.getRoot()?.getNode(PlayerHealthComponent);
    const isDead = health?.getIsDead() ?? false;

    let vx = sync.velocity.x;
    let vy = ENGINE.getVerticalVelocity(sync);
    let coyote = sync.custom.get<number>(KEY_COYOTE) ?? cfg.coyoteTime + 1;
    let buffer = sync.custom.get<number>(KEY_BUFFER) ?? cfg.jumpBufferTime + 1;
    let jumping = sync.custom.get<boolean>(KEY_JUMPING) ?? false;
    let facing = sync.custom.get<number>(KEY_FACING) ?? 1;

    const animState = mover.getRoot()?.getNode(ENGINE.AnimationStateMachineNode)?.getGraphState('base');
    const hitReacting = animState === 'damage';
    const rooted = isDead || hitReacting;

    const moveX = rooted ? 0 : THREE.MathUtils.clamp(input.moveInput.x, -1, 1);
    const hasInput = Math.abs(moveX) > 0.01;
    const attacking = !rooted && (mover.getRoot()?.getNode(AttackComponent)?.isAttacking() ?? false);

    // Root the character for the whole swing so locomotion doesn't fight SwordSlash.
    if (!attacking && hasInput) facing = moveX > 0 ? 1 : -1;

    // Advance the jump buffer; a fresh press resets it to zero.
    buffer += dt;
    if (!rooted && input.jumpJustPressed) buffer = 0;

    // Horizontal: knockback overrides control; otherwise root/attack zero, else accel.
    const knockbackVx = health?.tickKnockback(dt) ?? null;
    if (knockbackVx !== null) {
      vx = knockbackVx;
    } else if (rooted || attacking) {
      // Dead / damage reaction / attack: kill horizontal so the pose doesn't skate.
      vx = 0;
    } else {
      const target = proposedMove.velocity.x;
      const controlScale = this.isGround() ? 1 : cfg.airControl;
      const rate = (hasInput ? cfg.acceleration : cfg.deceleration) * controlScale;
      vx = moveToward(vx, target, rate * dt);
    }

    // Variable jump: cut upward velocity when the button is released while still rising.
    if (!rooted && !this.isGround() && jumping && vy > 0 && !input.jumpPressed) {
      vy *= cfg.jumpCutMultiplier;
      jumping = false;
    }

    // Jump initiation (buffered on ground, coyote-assisted in the air). Locked out while rooted/attacking.
    const canJump = !rooted && !attacking && (this.isGround()
      ? buffer <= cfg.jumpBufferTime
      : buffer <= cfg.jumpBufferTime && coyote <= cfg.coyoteTime && !jumping);
    if (canJump) {
      vy = cfg.jumpForce;
      jumping = true;
      buffer = cfg.jumpBufferTime + 1;
      coyote = cfg.coyoteTime + 1;
      feedback.emit('jump', { position: sync.position.clone() });
    }

    // Gravity: separate rising vs falling for a snappier arc.
    const g = vy > 0 ? cfg.gravity : cfg.fallGravity;
    vy -= g * dt;
    if (vy < -cfg.maxFallSpeed) vy = -cfg.maxFallSpeed;

    // Move through the KCC, keeping the character on the Z plane.
    let isGrounded = false;
    let kccGrounded = false;
    let hitGround = false;
    let hitCeiling = false;
    let reqDx = 0;
    let reqDy = 0;
    let actDx = 0;
    let actDy = 0;
    let blockedX = false;
    let blockedUp = false;
    let blockedDown = false;
    let heurGround = false;
    let heurCeiling = false;

    const root = ENGINE.getPrimitiveRoot(mover);
    const hasController = root && ENGINE.ensureCharacterController(mover, this.controllerOptions);

    if (root && hasController) {
      const physicsEngine = mover.getPhysicsEngine()!;
      // Rising jump: use true vy. Otherwise keep a minimum floor-seeking sweep so Rapier
      // still emits ground contacts when dt is tiny (slomo) or vy was zeroed last tick.
      // Without this, `hitGround` (per-sweep normals) flickers off while `kccGrounded` stays on.
      const risingJump = jumping && vy > 0;
      let moveY = vy * dt;
      if (!risingJump) {
        const minDown = Math.max(1e-3, cfg.groundCheckDistance * 0.05);
        if (moveY > -minDown) moveY = -minDown;
      }
      const delta = new THREE.Vector3(vx * dt, moveY, 0);
      const moved = physicsEngine.computeCharacterMovement(
        mover, root, delta.toArray(), false, dt, false,
      );
      kccGrounded = moved.isGrounded;
      hitGround = moved.hitGround;
      hitCeiling = moved.hitCeiling;
      // Acquire floor from strict contact normals (`hitGround`). Rapier's `computedGrounded`
      // alone is too loose on walls, but once we were grounded it is a stable stick signal —
      // `hitGround` alone flickers under small sweeps / mesh seams and desyncs anim + mode.
      isGrounded = hitGround || (wasGrounded && kccGrounded && !risingJump);
      sync.position.add(moved.actualMovement);

      reqDx = delta.x;
      reqDy = delta.y;
      actDx = moved.actualMovement.x;
      actDy = moved.actualMovement.y;
      blockedX = isAxisBlocked(reqDx, actDx);
      blockedUp = reqDy > 0 && isAxisBlocked(reqDy, actDy);
      blockedDown = reqDy < 0 && isAxisBlocked(reqDy, actDy);
      heurGround = blockedDown && !blockedX;
      heurCeiling = blockedUp && !blockedX;

      // Ceiling bonk: require a real downward-facing contact AND nearly-blocked upward motion.
      if (vy > 0 && hitCeiling && blockedUp) {
        vy = 0;
        jumping = false;
      }

      sync.position.z = cfg.planeZ;
      root.position.copy(sync.position);
      root.setPhysicsTransformUpdateFlags({
        sendPosition: true,
        sendRotation: false,
        receivePosition: false,
        receiveRotation: false,
      });
    } else {
      sync.position.x += vx * dt;
      sync.position.y += vy * dt;
      sync.position.z = cfg.planeZ;
      isGrounded = true;
      kccGrounded = true;
      hitGround = true;
    }

    // While rising from a jump, ignore grounded — snap/edge contacts can still report
    // grounded for a frame and would zero vy (classic "ledge ate my jump").
    if (jumping && vy > 0) {
      isGrounded = false;
    }

    if (isGrounded) {
      vy = 0;
      jumping = false;
      coyote = 0;
    } else {
      coyote += dt;
    }

    if (!wasGrounded && isGrounded) {
      feedback.emit('land', { position: sync.position.clone() });
    }

    // Keep the collider upright; facing is applied to the visual, not the body.
    sync.rotation.set(0, 0, 0, 'YXZ');
    sync.velocity.set(vx, vy, 0);
    sync.tags = [isGrounded ? ENGINE.GROUNDED_TAG : ENGINE.FALLING_TAG];

    ENGINE.setVerticalVelocity(sync, vy);
    sync.custom.set(KEY_COYOTE, coyote);
    sync.custom.set(KEY_BUFFER, buffer);
    sync.custom.set(KEY_JUMPING, jumping);
    sync.custom.set(KEY_FACING, facing);
    sync.custom.set(KEY_DEBUG, {
      mode: this.isGround() ? GROUND_MODE_NAME : AIR_MODE_NAME,
      vx,
      vy,
      posX: sync.position.x,
      posY: sync.position.y,
      moveX,
      jumpPressed: !!input.jumpPressed,
      kccGrounded,
      hitGround,
      hitCeiling,
      groundedApplied: isGrounded,
      jumping,
      coyote,
      buffer,
      facing,
      reqDx,
      reqDy,
      actDx,
      actDy,
      blockedX,
      blockedUp,
      blockedDown,
      heurGround,
      heurCeiling,
      tags: sync.tags.join(','),
    } satisfies PlatformerDebugSnapshot);

    return { syncState: sync, auxState };
  }
}
