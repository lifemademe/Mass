/**
 * Inspector-facing sound paths and volumes for feedback-driven SFX.
 *
 * Owned by {@link Action2DSettingsActor}; {@link SoundFeedbackBinder} reads these
 * values when Play begins.
 */
import * as ENGINE from '@gnsx/genesys.js';

import type { FeedbackEvent } from '../core/FeedbackEvents.js';

export interface SoundCue {
  url: string;
  volume?: number;
  /** Prefer positional playback when a world position is available. */
  positional?: boolean;
}

/** Default project audio paths used by the template. */
export const TEMPLATE_AUDIO = {
  footstep: '@project/assets/audio/footstep.wav',
  jump: '@project/assets/audio/jump.wav',
  land: '@project/assets/audio/land.wav',
  swordSwing: '@project/assets/audio/sword-swing.wav',
  swordHit: '@project/assets/audio/sword-hit.wav',
  playerHurt: '@project/assets/audio/player-hurt.wav',
  playerDeath: '@project/assets/audio/player-death.wav',
  enemyAttack: '@project/assets/audio/enemy-attack.wav',
  enemyHurt: '@project/assets/audio/enemy-hurt.wav',
  enemyDeath: '@project/assets/audio/enemy-death.wav',
  enemyNearby: '@project/assets/audio/enemy-nearby.wav',
  despawn: '@project/assets/audio/despawn.wav',
  pickup: '@project/assets/audio/pickup.wav',
  checkpoint: '@project/assets/audio/checkpoint.wav',
  levelComplete: '@project/assets/audio/level-complete.wav',
} as const;

@ENGINE.GameClass()
export class SoundFeedbackSettingsComponent extends ENGINE.SceneNode {
  @ENGINE.property({
    type: 'audioPath',
    category: 'Movement',
    description: 'Sound played for each animation-driven footstep.',
  })
  public footstepPath = TEMPLATE_AUDIO.footstep;

  @ENGINE.property({
    type: 'number',
    category: 'Movement',
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Footstep sound volume.',
  })
  public footstepVolume = 0.35;

  @ENGINE.property({
    type: 'audioPath',
    category: 'Movement',
    description: 'Sound played when the player jumps.',
  })
  public jumpPath = TEMPLATE_AUDIO.jump;

  @ENGINE.property({
    type: 'number',
    category: 'Movement',
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Jump sound volume.',
  })
  public jumpVolume = 0.55;

  @ENGINE.property({
    type: 'audioPath',
    category: 'Movement',
    description: 'Sound played when the player lands.',
  })
  public landPath = TEMPLATE_AUDIO.land;

  @ENGINE.property({
    type: 'number',
    category: 'Movement',
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Landing sound volume.',
  })
  public landVolume = 0.6;

  @ENGINE.property({
    type: 'audioPath',
    category: 'Player Combat',
    description: 'Sound played when a melee attack starts.',
  })
  public swordSwingPath = TEMPLATE_AUDIO.swordSwing;

  @ENGINE.property({
    type: 'number',
    category: 'Player Combat',
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Melee swing sound volume.',
  })
  public swordSwingVolume = 0.5;

  @ENGINE.property({
    type: 'audioPath',
    category: 'Player Combat',
    description: 'Sound played when a melee attack connects.',
  })
  public swordHitPath = TEMPLATE_AUDIO.swordHit;

  @ENGINE.property({
    type: 'number',
    category: 'Player Combat',
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Melee hit sound volume.',
  })
  public swordHitVolume = 0.75;

  @ENGINE.property({
    type: 'audioPath',
    category: 'Player Combat',
    description: 'Sound played when the player takes damage.',
  })
  public playerHurtPath = TEMPLATE_AUDIO.playerHurt;

  @ENGINE.property({
    type: 'number',
    category: 'Player Combat',
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Player hurt sound volume.',
  })
  public playerHurtVolume = 0.7;

  @ENGINE.property({
    type: 'audioPath',
    category: 'Player Combat',
    description: 'Sound played when the player dies.',
  })
  public playerDeathPath = TEMPLATE_AUDIO.playerDeath;

  @ENGINE.property({
    type: 'number',
    category: 'Player Combat',
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Player death sound volume.',
  })
  public playerDeathVolume = 0.85;

  @ENGINE.property({
    type: 'audioPath',
    category: 'Enemy',
    description: 'Sound played when an enemy attacks.',
  })
  public enemyAttackPath = TEMPLATE_AUDIO.enemyAttack;

  @ENGINE.property({
    type: 'number',
    category: 'Enemy',
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Enemy attack sound volume.',
  })
  public enemyAttackVolume = 0.65;

  @ENGINE.property({
    type: 'audioPath',
    category: 'Enemy',
    description: 'Sound played when an enemy takes damage.',
  })
  public enemyHurtPath = TEMPLATE_AUDIO.enemyHurt;

  @ENGINE.property({
    type: 'number',
    category: 'Enemy',
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Enemy hurt sound volume.',
  })
  public enemyHurtVolume = 0.55;

  @ENGINE.property({
    type: 'audioPath',
    category: 'Enemy',
    description: 'Sound played when an enemy dies.',
  })
  public enemyDeathPath = TEMPLATE_AUDIO.enemyDeath;

  @ENGINE.property({
    type: 'number',
    category: 'Enemy',
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Enemy death sound volume.',
  })
  public enemyDeathVolume = 0.8;

  @ENGINE.property({
    type: 'audioPath',
    category: 'World',
    description: 'Sound played when an actor despawns.',
  })
  public despawnPath = TEMPLATE_AUDIO.despawn;

  @ENGINE.property({
    type: 'number',
    category: 'World',
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Despawn sound volume.',
  })
  public despawnVolume = 0.7;

  @ENGINE.property({
    type: 'audioPath',
    category: 'World',
    description: 'Sound played when the player collects a pickup.',
  })
  public pickupPath = TEMPLATE_AUDIO.pickup;

  @ENGINE.property({
    type: 'number',
    category: 'World',
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Pickup sound volume.',
  })
  public pickupVolume = 0.7;

  @ENGINE.property({
    type: 'audioPath',
    category: 'World',
    description: 'Sound played when a checkpoint activates.',
  })
  public checkpointPath = TEMPLATE_AUDIO.checkpoint;

  @ENGINE.property({
    type: 'number',
    category: 'World',
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Checkpoint sound volume.',
  })
  public checkpointVolume = 0.65;

  @ENGINE.property({
    type: 'audioPath',
    category: 'World',
    description: 'Sound played when the level is completed.',
  })
  public levelCompletePath = TEMPLATE_AUDIO.levelComplete;

  @ENGINE.property({
    type: 'number',
    category: 'World',
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Level-complete sound volume.',
  })
  public levelCompleteVolume = 0.8;

  public getEventSounds(): Partial<Record<FeedbackEvent, SoundCue>> {
    return {
      footstep: { url: this.footstepPath, volume: this.footstepVolume, positional: true },
      jump: { url: this.jumpPath, volume: this.jumpVolume, positional: true },
      land: { url: this.landPath, volume: this.landVolume, positional: true },
      attackStart: { url: this.swordSwingPath, volume: this.swordSwingVolume, positional: true },
      attackHit: { url: this.swordHitPath, volume: this.swordHitVolume, positional: true },
      playerDamage: { url: this.playerHurtPath, volume: this.playerHurtVolume },
      playerDeath: { url: this.playerDeathPath, volume: this.playerDeathVolume },
      enemyAttack: { url: this.enemyAttackPath, volume: this.enemyAttackVolume, positional: true },
      enemyDamage: { url: this.enemyHurtPath, volume: this.enemyHurtVolume, positional: true },
      enemyDeath: { url: this.enemyDeathPath, volume: this.enemyDeathVolume, positional: true },
      despawn: { url: this.despawnPath, volume: this.despawnVolume, positional: true },
      pickup: { url: this.pickupPath, volume: this.pickupVolume, positional: true },
      checkpoint: { url: this.checkpointPath, volume: this.checkpointVolume },
      levelComplete: { url: this.levelCompletePath, volume: this.levelCompleteVolume },
    };
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_Sound';
  }
}

/** Default feedback → SFX map used when no Inspector settings component is supplied. */
export const DEFAULT_EVENT_SOUNDS: Partial<Record<FeedbackEvent, SoundCue>> = {
  footstep: { url: TEMPLATE_AUDIO.footstep, volume: 0.35, positional: true },
  jump: { url: TEMPLATE_AUDIO.jump, volume: 0.55, positional: true },
  land: { url: TEMPLATE_AUDIO.land, volume: 0.6, positional: true },
  attackStart: { url: TEMPLATE_AUDIO.swordSwing, volume: 0.5, positional: true },
  attackHit: { url: TEMPLATE_AUDIO.swordHit, volume: 0.75, positional: true },
  playerDamage: { url: TEMPLATE_AUDIO.playerHurt, volume: 0.7 },
  playerDeath: { url: TEMPLATE_AUDIO.playerDeath, volume: 0.85 },
  enemyAttack: { url: TEMPLATE_AUDIO.enemyAttack, volume: 0.65, positional: true },
  enemyDamage: { url: TEMPLATE_AUDIO.enemyHurt, volume: 0.55, positional: true },
  enemyDeath: { url: TEMPLATE_AUDIO.enemyDeath, volume: 0.8, positional: true },
  despawn: { url: TEMPLATE_AUDIO.despawn, volume: 0.7, positional: true },
  pickup: { url: TEMPLATE_AUDIO.pickup, volume: 0.7, positional: true },
  checkpoint: { url: TEMPLATE_AUDIO.checkpoint, volume: 0.65 },
  levelComplete: { url: TEMPLATE_AUDIO.levelComplete, volume: 0.8 },
};
