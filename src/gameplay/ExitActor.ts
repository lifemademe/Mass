/**
 * ExitActor - level-completion goal, gated on defeating the level's enemies.
 *
 * Starts inactive; when the shared `GameState` reports all enemies defeated it activates
 * (changing tint + firing `exitActivated`). Reaching an active exit completes the level.
 * Uses {@link PlayerProximityActor} only while unlocked.
 */
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { Action2DGameMode } from '../core/Action2DGameMode.js';
import { feedback } from '../core/FeedbackEvents.js';
import type { PlatformerPawn } from '../player/PlatformerPawn.js';

import { PlayerProximityActor, type PlayerProximityActorOptions } from './PlayerProximityActor.js';

export type ExitActorOptions = PlayerProximityActorOptions;

const LOCKED_COLOR = 0x553355;
const OPEN_COLOR = 0x66ccff;

@ENGINE.GameClass()
export class ExitActor extends PlayerProximityActor {
  @ENGINE.property({
    type: 'number',
    category: 'Proximity',
    min: 0.1,
    max: 20,
    step: 0.1,
    description: 'Distance from the open exit at which the player completes the level (units).',
  })
  public override radius = 1.1;

  /** Door mid-height — keep the trigger on the doorway, not under the floor. */
  protected override zoneOffsetY = 1.5;

  private active = false;
  private completed = false;
  private door: ENGINE.MeshNode | null = null;

  public override initialize(options?: ExitActorOptions): void {
    super.initialize({ radius: 1.1, ...options });

    this.door = ENGINE.MeshNode.create({
      name: 'ExitDoor',
      geometry: new THREE.BoxGeometry(1.6, 3, 0.4),
      material: new THREE.MeshStandardMaterial({ color: LOCKED_COLOR, emissive: 0x000000 }),
      position: new THREE.Vector3(0, 1.5, 0),
      physicsOptions: { enabled: false },
    });
    this.add(this.door);
  }

  protected override bindRuntimeComponents(): void {
    super.bindRuntimeComponents();
    // Name lookup only — TriggerZoneNode also extends MeshNode.
    this.door = this.getNodes(ENGINE.MeshNode).find((m) => m.name === 'ExitDoor')
      ?? this.door;
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) {
      return false;
    }
    const gameState = Action2DGameMode.get(this.getWorld())?.gameState;
    if (!gameState) return true;

    // A restored save may already be past the enemy objective without firing
    // onAllEnemiesDefeated again after this actor subscribes.
    const objectiveAlreadyCleared = gameState.phase !== 'defeatEnemy';
    if (objectiveAlreadyCleared || gameState.allEnemiesDefeated()) {
      this.activate();
    } else {
      gameState.onAllEnemiesDefeated.add(() => this.activate());
    }
    return true;
  }

  protected override shouldAcceptProximity(): boolean {
    return this.active && !this.completed;
  }

  protected override onPlayerInRange(_player: PlatformerPawn): void {
    if (this.completed) return;
    this.completed = true;
    Action2DGameMode.get(this.getWorld())?.gameState.setPhase('complete');
    feedback.emit('levelComplete', { message: 'Level Complete!' });
  }

  private activate(): void {
    if (this.active) return;
    this.active = true;
    if (this.door) {
      this.door.material = new THREE.MeshStandardMaterial({ color: OPEN_COLOR, emissive: 0x1a4a66 });
    }
    feedback.emit('exitActivated', {
      position: this.getWorldPosition().clone(),
      message: 'The exit is open!',
    });
    // Player may already be standing in the trigger while it was locked.
    this.flushActorsAlreadyInZone();
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_TriggerZone';
  }
}
