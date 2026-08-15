/**
 * Inspector-facing knobs for the player animation driver and attack playback rate.
 */
import * as ENGINE from '@gnsx/genesys.js';

import {
  DEFAULT_PLAYER_ANIMATION_TUNING,
  type PlayerAnimationTuning,
} from './PlayerAnimationTuning.js';

@ENGINE.GameClass()
export class PlayerAnimationSettingsComponent extends ENGINE.SceneNode {
  @ENGINE.property({
    type: 'number',
    category: 'Animation',
    min: 0,
    max: 0.5,
    step: 0.01,
    description: 'Normalized speed above which the character counts as moving.',
  })
  public moveThreshold = DEFAULT_PLAYER_ANIMATION_TUNING.moveThreshold;

  @ENGINE.property({
    type: 'number',
    category: 'Animation',
    min: 0,
    max: 30,
    step: 0.5,
    description: 'Seconds standing still before an idle-break clip plays.',
  })
  public idleBreakDelaySeconds = DEFAULT_PLAYER_ANIMATION_TUNING.idleBreakDelaySeconds;

  @ENGINE.property({
    type: 'number',
    category: 'Animation',
    min: 1,
    max: 60,
    step: 0.5,
    description: 'Downward impact speed (units/s) that picks the heavy land clip.',
  })
  public hardLandingSpeed = DEFAULT_PLAYER_ANIMATION_TUNING.hardLandingSpeed;

  @ENGINE.property({
    type: 'number',
    category: 'Animation',
    min: 1,
    max: 40,
    step: 0.5,
    description: 'Vertical-speed magnitude (units/s) mapped across the air rise/fall blend.',
  })
  public airBlendRange = DEFAULT_PLAYER_ANIMATION_TUNING.airBlendRange;

  @ENGINE.property({
    type: 'number',
    category: 'Animation',
    min: 0.1,
    max: 2,
    step: 0.05,
    description: 'Safety timeout (s): force air loop if take-off clip never finishes.',
  })
  public takeoffTimeoutSeconds = DEFAULT_PLAYER_ANIMATION_TUNING.takeoffTimeoutSeconds;

  @ENGINE.property({
    type: 'number',
    category: 'Animation',
    min: 0.1,
    max: 2,
    step: 0.05,
    description: 'Safety timeout (s): leave land state if its clip never finishes.',
  })
  public landingTimeoutSeconds = DEFAULT_PLAYER_ANIMATION_TUNING.landingTimeoutSeconds;

  @ENGINE.property({
    type: 'number',
    category: 'Animation',
    min: 0.1,
    max: 2,
    step: 0.05,
    description: 'Safety timeout (s): leave damage state if its clip never finishes.',
  })
  public damageTimeoutSeconds = DEFAULT_PLAYER_ANIMATION_TUNING.damageTimeoutSeconds;

  @ENGINE.property({
    type: 'number',
    category: 'Attack Anim',
    min: 0.25,
    max: 4,
    step: 0.05,
    description: 'Playback rate of SwordSlash (also scales melee hit windows).',
  })
  public attackPlaybackSpeed = DEFAULT_PLAYER_ANIMATION_TUNING.attackPlaybackSpeed;

  @ENGINE.property({
    type: 'number',
    category: 'Attack Anim',
    min: 0.1,
    max: 2,
    step: 0.05,
    description: 'Safety timeout (s): leave attack state if SwordSlash never finishes.',
  })
  public attackTimeoutSeconds = DEFAULT_PLAYER_ANIMATION_TUNING.attackTimeoutSeconds;

  public toTuning(): PlayerAnimationTuning {
    return {
      moveThreshold: this.moveThreshold,
      idleBreakDelaySeconds: this.idleBreakDelaySeconds,
      hardLandingSpeed: this.hardLandingSpeed,
      airBlendRange: this.airBlendRange,
      takeoffTimeoutSeconds: this.takeoffTimeoutSeconds,
      landingTimeoutSeconds: this.landingTimeoutSeconds,
      damageTimeoutSeconds: this.damageTimeoutSeconds,
      attackPlaybackSpeed: Math.max(0.01, this.attackPlaybackSpeed),
      attackTimeoutSeconds: this.attackTimeoutSeconds,
    };
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_Animation';
  }
}
