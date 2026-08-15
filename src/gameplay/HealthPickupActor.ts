/**
 * HealthPickupActor - collectible that restores player health on contact.
 *
 * Spins its GLB for readability and heals the player's `PlayerHealthComponent` on pickup via
 * shared player proximity, then fires pickup feedback and removes itself.
 */
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { feedback } from '../core/FeedbackEvents.js';
import type { PlatformerPawn } from '../player/PlatformerPawn.js';

import { PlayerProximityActor, type PlayerProximityActorOptions } from './PlayerProximityActor.js';

const HEALTH_MODEL_URL = '@engine/assets/models/PickupActors/SM_Pickup_Health.glb';

export interface HealthPickupActorOptions extends PlayerProximityActorOptions {
  /** Amount of health restored on pickup. */
  healAmount?: number;
  /** Uniform scale of the visual. */
  visualScale?: number;
}

@ENGINE.GameClass()
export class HealthPickupActor extends PlayerProximityActor {
  @ENGINE.property({
    type: 'number',
    category: 'Proximity',
    min: 0.1,
    max: 20,
    step: 0.1,
    description: 'Distance from this actor at which the player collects the pickup (units).',
  })
  public override radius = 0.55;

  private healAmount = 40;
  private visualScale = 1;

  private collected = false;
  private visual: ENGINE.ModelMeshNode | null = null;

  public override initialize(options?: HealthPickupActorOptions): void {
    super.initialize({ radius: 0.55, ...options });
    this.healAmount = options?.healAmount ?? this.healAmount;
    this.visualScale = options?.visualScale ?? this.visualScale;

    this.visual = ENGINE.ModelMeshNode.create({
      name: 'HealthPickupVisual',
      modelUrl: HEALTH_MODEL_URL,
      scale: new THREE.Vector3(this.visualScale, this.visualScale, this.visualScale),
      physicsOptions: { enabled: false },
      castShadow: true,
    });
    this.add(this.visual);
  }

  protected override bindRuntimeComponents(): void {
    super.bindRuntimeComponents();
    this.visual = this.getNodes(ENGINE.ModelMeshNode).find((m) => m.name === 'HealthPickupVisual')
      ?? this.getNode(ENGINE.ModelMeshNode)
      ?? this.visual;
  }

  protected override tickProximityVisual(deltaTime: number): void {
    if (this.collected || !this.visual) return;
    this.visual.rotation.y += deltaTime * 2;
  }

  protected override onPlayerInRange(player: PlatformerPawn): void {
    if (this.collected) return;

    this.collected = true;
    const healed = player.getHealth().heal(this.healAmount);
    feedback.emit('pickup', {
      amount: healed,
      position: this.getWorldPosition().clone(),
      message: 'Health restored',
    });
    this.destroy();
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_HealthPickup';
  }
}
