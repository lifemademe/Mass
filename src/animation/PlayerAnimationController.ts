/**
 * PlayerAnimationController - drives the Odyssey-style mannequin graph for the 2D pawn.
 *
 * Adapted for this template's `MoverComponent` + `PlayerHealthComponent` (single jump + ledge
 * fall). Attack swings are forced via {@link playAttack}.
 */
import * as ENGINE from '@gnsx/genesys.js';

import { defaultPlatformerMovementConfig } from '../movement/PlatformerMovementConfig.js';
import { PlatformerMovementSettingsComponent } from '../movement/PlatformerMovementSettingsComponent.js';
import { PlayerHealthComponent } from '../player/PlayerHealthComponent.js';

import { PlayerAnimationSettingsComponent } from './PlayerAnimationSettingsComponent.js';
import {
  DEFAULT_PLAYER_ANIMATION_TUNING,
  type PlayerAnimationTuning,
} from './PlayerAnimationTuning.js';

const BASE_GRAPH = 'base';

const State = {
  Idle: 'idle',
  IdleBreak: 'idleBreak',
  Locomotion: 'locomotion',
  JumpStart: 'jumpStart',
  AirLoop: 'airLoop',
  LandLight: 'landLight',
  LandHeavy: 'landHeavy',
  Damage: 'damage',
  Die: 'die',
  Attack: 'attack',
} as const;

const TAKEOFF_STATES = new Set<string>([State.JumpStart]);
const AIR_STATES = new Set<string>([State.JumpStart, State.AirLoop]);
const REACTION_STATES = new Set<string>([
  State.JumpStart, State.AirLoop,
  State.LandLight, State.LandHeavy, State.Damage, State.Die, State.Attack,
]);

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export class PlayerAnimationController {
  public readonly onFootstep = new ENGINE.Delegate<[string], void>();
  public readonly onJump = new ENGINE.Delegate<[number], void>();
  public readonly onLand = new ENGINE.Delegate<[string], void>();
  public readonly onDamage = new ENGINE.Delegate<[], void>();
  public readonly onDie = new ENGINE.Delegate<[], void>();

  private mover: ENGINE.MoverNode | null = null;
  private anim: ENGINE.AnimationStateMachineNode | null = null;
  private animSubscribed = false;

  private idleTimer = 0;
  private wasGrounded = true;
  private lastState: string | null = null;
  private timeInState = 0;

  private prevHealth = Number.POSITIVE_INFINITY;
  private isDeadLatched = false;

  private readonly onAnimationEventHandler = (payload: ENGINE.AnimationEventPayload): void => {
    this.handleAnimationEvent(payload);
  };

  constructor(private readonly host: ENGINE.SceneNode) {}

  private resolveTuning(): PlayerAnimationTuning {
    return this.host.getNode(PlayerAnimationSettingsComponent)?.toTuning()
      ?? { ...DEFAULT_PLAYER_ANIMATION_TUNING };
  }

  private resolveMaxSpeed(): number {
    const moveSpeed = this.host.getNode(PlatformerMovementSettingsComponent)?.moveSpeed
      ?? defaultPlatformerMovementConfig().moveSpeed;
    return Math.max(0.001, moveSpeed);
  }

  public attach(): void {
    this.ensureSubscriptions();
    // Seed the damage-detection baseline from actual starting health. Without this, the first
    // `update()` tick compares against the `Number.POSITIVE_INFINITY` field initializer, reads
    // that as a huge health drop, and forces the Damage state right on spawn.
    this.prevHealth = this.resolveHealth()?.getCurrentHealth() ?? Number.POSITIVE_INFINITY;
  }

  public detach(): void {
    if (this.anim && this.animSubscribed) {
      this.anim.onAnimationEvent.remove(this.onAnimationEventHandler);
    }
    this.animSubscribed = false;
    this.onFootstep.clear();
    this.onJump.clear();
    this.onLand.clear();
    this.onDamage.clear();
    this.onDie.clear();
  }

  /** Force the SwordSlash attack state (call when a melee swing actually starts). */
  public playAttack(): void {
    this.ensureSubscriptions();
    const anim = this.resolveAnim();
    if (!anim || !anim.isReady()) return;
    this.forceState(anim, State.Attack);
    const slash = anim.getActionsMap().get('SwordSlash');
    if (slash) slash.timeScale = this.resolveTuning().attackPlaybackSpeed;
  }

  /** Snap out of SwordSlash into idle (hit-cancel feel experiment). */
  public cancelAttack(): void {
    this.ensureSubscriptions();
    const anim = this.resolveAnim();
    if (!anim || !anim.isReady()) return;
    if (anim.getGraphState(BASE_GRAPH) !== State.Attack) return;
    this.forceState(anim, State.Idle);
  }

  /**
   * Computes graph parameters and applies forced reaction transitions for this tick.
   * Caller should push the returned map via `setParameter`.
   */
  public update(deltaTime: number): Record<string, number | boolean> {
    this.ensureSubscriptions();

    const mover = this.resolveMover();
    const params: Record<string, number | boolean> = {};
    if (!mover) return params;

    const tuning = this.resolveTuning();
    const sync = mover.getSyncState();
    const planarSpeed = Math.abs(sync.velocity.x);
    const vertical = sync.velocity.y;
    const normSpeed = clamp01(planarSpeed / this.resolveMaxSpeed());
    const grounded = mover.hasSyncTag(ENGINE.GROUNDED_TAG, true);
    const moving = normSpeed > tuning.moveThreshold;

    const rise = clamp01(0.5 + vertical / (2 * tuning.airBlendRange));

    const anim = this.anim;
    const ready = !!anim && anim.isReady();
    if (ready && anim) {
      this.updateReactions(anim, deltaTime, grounded, moving, vertical, tuning);
    }

    const state = ready && anim ? anim.getGraphState(BASE_GRAPH) : null;

    params.riseWeight = rise;
    params.fallWeight = 1 - rise;
    params.grounded = grounded;
    params.moving = moving;
    params.dead = this.isDeadLatched;
    params.idleBreak = this.updateIdleBreak(state, deltaTime, moving, grounded, tuning);

    return params;
  }

  private updateIdleBreak(
    state: string | null,
    deltaTime: number,
    moving: boolean,
    grounded: boolean,
    tuning: PlayerAnimationTuning,
  ): boolean {
    if (state === State.IdleBreak || state === State.Attack) {
      this.idleTimer = 0;
      return false;
    }
    if (state === State.Idle && !moving && grounded) {
      this.idleTimer += deltaTime;
      return this.idleTimer >= tuning.idleBreakDelaySeconds;
    }
    this.idleTimer = 0;
    return false;
  }

  private updateReactions(
    anim: ENGINE.AnimationStateMachineNode,
    deltaTime: number,
    grounded: boolean,
    moving: boolean,
    vertical: number,
    tuning: PlayerAnimationTuning,
  ): void {
    const state = anim.getGraphState(BASE_GRAPH);
    if (state !== this.lastState) {
      this.lastState = state;
      this.timeInState = 0;
    } else {
      this.timeInState += deltaTime;
    }

    const wasGrounded = this.wasGrounded;
    this.wasGrounded = grounded;

    const health = this.resolveHealth();
    const isDead = health?.getIsDead() ?? false;
    if (isDead && !this.isDeadLatched) {
      this.isDeadLatched = true;
      this.forceState(anim, State.Die);
      return;
    }
    if (!isDead && this.isDeadLatched) {
      this.isDeadLatched = false;
      this.prevHealth = health?.getCurrentHealth() ?? Number.POSITIVE_INFINITY;
      this.forceState(anim, State.Idle);
      return;
    }
    if (this.isDeadLatched) return;

    // Do not interrupt an in-progress swing with jump/land/damage polling.
    if (state === State.Attack) {
      if (this.timeInState > tuning.attackTimeoutSeconds) {
        this.forceState(anim, moving ? State.Locomotion : State.Idle);
      }
      return;
    }

    const currentHealth = health?.getCurrentHealth() ?? this.prevHealth;
    if (currentHealth < this.prevHealth - 1e-4) {
      this.prevHealth = currentHealth;
      this.forceState(anim, State.Damage);
      return;
    }
    this.prevHealth = currentHealth;

    // Take-off: left ground with upward velocity (single jump for now).
    if (wasGrounded && !grounded && vertical > 0.5) {
      this.forceState(anim, State.JumpStart);
      return;
    }

    // Landing.
    if (!wasGrounded && grounded) {
      const impact = Math.max(0, -vertical);
      const hardLanding = impact >= tuning.hardLandingSpeed;
      this.forceState(anim, hardLanding ? State.LandHeavy : State.LandLight);
      return;
    }

    // Ledge fall: airborne without a jump take-off.
    if (wasGrounded && !grounded && !AIR_STATES.has(state ?? '') && !REACTION_STATES.has(state ?? '')) {
      this.forceState(anim, State.AirLoop);
      return;
    }

    if (state && TAKEOFF_STATES.has(state) && this.timeInState > tuning.takeoffTimeoutSeconds) {
      this.forceState(anim, State.AirLoop);
    } else if (
      (state === State.LandLight || state === State.LandHeavy)
      && this.timeInState > tuning.landingTimeoutSeconds
    ) {
      this.forceState(anim, moving ? State.Locomotion : State.Idle);
    } else if (state === State.Damage && this.timeInState > tuning.damageTimeoutSeconds) {
      this.forceState(anim, moving ? State.Locomotion : State.Idle);
    }
  }

  private forceState(anim: ENGINE.AnimationStateMachineNode, target: string): void {
    if (anim.getGraphState(BASE_GRAPH) === target) return;
    anim.transitionGraphToState(BASE_GRAPH, target);
    this.lastState = target;
    this.timeInState = 0;
  }

  private handleAnimationEvent(payload: ENGINE.AnimationEventPayload): void {
    switch (payload.eventName) {
      case 'footstep':
        this.onFootstep.invoke(payload.tag ?? '');
        break;
      case 'jump':
        this.onJump.invoke(1);
        break;
      case 'land':
        this.onLand.invoke(payload.tag ?? 'soft');
        break;
      case 'damage':
        this.onDamage.invoke();
        break;
      case 'die':
        this.onDie.invoke();
        break;
      default:
        break;
    }
  }

  private ensureSubscriptions(): void {
    if (!this.animSubscribed) {
      const anim = this.resolveAnim();
      if (anim) {
        anim.onAnimationEvent.add(this.onAnimationEventHandler);
        this.animSubscribed = true;
      }
    }
  }

  private resolveMover(): ENGINE.MoverNode | null {
    if (!this.mover) {
      this.mover = this.host.getNode(ENGINE.MoverNode);
    }
    return this.mover;
  }

  private resolveAnim(): ENGINE.AnimationStateMachineNode | null {
    if (!this.anim) {
      this.anim = this.host.getNode(ENGINE.AnimationStateMachineNode);
    }
    return this.anim;
  }

  private resolveHealth(): PlayerHealthComponent | null {
    return this.host.getNode(PlayerHealthComponent);
  }
}
