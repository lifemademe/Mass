/**
 * CheckpointActor - one-shot respawn point.
 *
 * When the player comes within range it records its transform as the active respawn point in
 * the shared `GameState`, fires checkpoint feedback, and turns from inactive to active tint.
 */
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { Action2DGameMode } from '../core/Action2DGameMode.js';
import { feedback } from '../core/FeedbackEvents.js';
import { PLATFORMER_COLLIDER_HALF_HEIGHT, type PlatformerPawn } from '../player/PlatformerPawn.js';

import { PlayerProximityActor, type PlayerProximityActorOptions } from './PlayerProximityActor.js';

export interface CheckpointActorOptions extends PlayerProximityActorOptions {
  /** Stable checkpoint id. */
  id?: string;
  /** Vertical offset applied to the recorded respawn position. */
  respawnOffsetY?: number;
}

const INACTIVE_COLOR = 0x8899aa;
const ACTIVE_COLOR = 0x44dd88;

@ENGINE.GameClass()
export class CheckpointActor extends PlayerProximityActor {
  @ENGINE.property({
    type: 'number',
    category: 'Proximity',
    min: 0.1,
    max: 20,
    step: 0.1,
    description: 'Distance from this actor at which the player triggers the checkpoint (units).',
  })
  public override radius = 1.0;

  /** Marker mid-height — keep the trigger centered on the pole, not in the floor. */
  protected override zoneOffsetY = 1.2;

  /** Stable gameplay id (not THREE.Object3D.id). */
  private checkpointId = 'checkpoint';
  /** Lift spawn to capsule center (checkpoint actor sits on the floor). */
  private respawnOffsetY = PLATFORMER_COLLIDER_HALF_HEIGHT;

  private activated = false;
  private marker: ENGINE.MeshNode | null = null;

  public override initialize(options?: CheckpointActorOptions): void {
    super.initialize({ radius: 1.0, ...options });
    this.checkpointId = options?.id ?? this.checkpointId;
    this.respawnOffsetY = options?.respawnOffsetY ?? this.respawnOffsetY;

    this.marker = ENGINE.MeshNode.create({
      name: 'CheckpointMarker',
      geometry: new THREE.BoxGeometry(0.25, 2.4, 0.25),
      material: new THREE.MeshStandardMaterial({ color: INACTIVE_COLOR, emissive: 0x000000 }),
      position: new THREE.Vector3(0, 1.2, 0),
      physicsOptions: { enabled: false },
    });
    this.add(this.marker);
  }

  protected override bindRuntimeComponents(): void {
    super.bindRuntimeComponents();
    // Name lookup only — TriggerZoneNode also extends MeshNode.
    this.marker = this.getNodes(ENGINE.MeshNode).find((m) => m.name === 'CheckpointMarker')
      ?? this.marker;
  }

  protected override onPlayerInRange(_player: PlatformerPawn): void {
    if (this.activated) return;

    const gameMode = Action2DGameMode.get(this.getWorld());
    if (!gameMode) {
      this.resetProximityLatch();
      return;
    }

    this.activated = true;
    const position = this.getWorldPosition();
    gameMode.gameState.setCheckpoint({
      id: this.checkpointId,
      position: new THREE.Vector3(position.x, position.y + this.respawnOffsetY, position.z),
      rotation: new THREE.Euler(),
    });
    if (this.marker) {
      this.marker.material = new THREE.MeshStandardMaterial({ color: ACTIVE_COLOR, emissive: 0x116633 });
    }
    feedback.emit('checkpoint', { position: position.clone(), message: 'Checkpoint reached' });
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_TriggerZone';
  }
}
