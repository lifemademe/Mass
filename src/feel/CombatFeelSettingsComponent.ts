/**
 * Inspector-facing knobs for hit-stop, camera shake, and hit-spark juice.
 *
 * Owned by {@link Action2DSettingsActor}; {@link CombatFeedbackBinder} reads these values.
 */
import * as ENGINE from '@gnsx/genesys.js';

const DEFAULT_HIT_SPARK_VFX = '@project/assets/vfx/hit-spark.vfx.json';

@ENGINE.GameClass()
export class CombatFeelSettingsComponent extends ENGINE.SceneNode {
  @ENGINE.property({
    type: 'number',
    category: 'Hit Stop',
    min: 0,
    max: 0.5,
    step: 0.005,
    description: 'Hit-stop duration (s) when a melee swing connects.',
  })
  public attackHitStop = 0.045;

  @ENGINE.property({
    type: 'number',
    category: 'Hit Stop',
    min: 0,
    max: 0.5,
    step: 0.005,
    description: 'Hit-stop duration (s) when the player takes damage.',
  })
  public playerDamageHitStop = 0.07;

  @ENGINE.property({
    type: 'number',
    category: 'Hit Stop',
    min: 0,
    max: 0.5,
    step: 0.005,
    description: 'Hit-stop duration (s) when an enemy dies.',
  })
  public enemyDeathHitStop = 0.09;

  @ENGINE.property({
    type: 'number',
    category: 'Hit Stop',
    min: 0,
    max: 0.5,
    step: 0.005,
    description: 'Hit-stop duration (s) when the player dies.',
  })
  public playerDeathHitStop = 0.12;

  @ENGINE.property({
    type: 'number',
    category: 'Camera Shake',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Camera shake amplitude on melee connect.',
  })
  public attackHitShakeAmplitude = 0.1;

  @ENGINE.property({
    type: 'number',
    category: 'Camera Shake',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Camera shake duration (s) on melee connect.',
  })
  public attackHitShakeDuration = 0.12;

  @ENGINE.property({
    type: 'number',
    category: 'Camera Shake',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Camera shake amplitude when the player takes damage.',
  })
  public playerDamageShakeAmplitude = 0.22;

  @ENGINE.property({
    type: 'number',
    category: 'Camera Shake',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Camera shake duration (s) when the player takes damage.',
  })
  public playerDamageShakeDuration = 0.2;

  @ENGINE.property({
    type: 'number',
    category: 'Camera Shake',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Camera shake amplitude when an enemy dies.',
  })
  public enemyDeathShakeAmplitude = 0.16;

  @ENGINE.property({
    type: 'number',
    category: 'Camera Shake',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Camera shake duration (s) when an enemy dies.',
  })
  public enemyDeathShakeDuration = 0.22;

  @ENGINE.property({
    type: 'number',
    category: 'Camera Shake',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Camera shake amplitude when the player dies.',
  })
  public playerDeathShakeAmplitude = 0.28;

  @ENGINE.property({
    type: 'number',
    category: 'Camera Shake',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Camera shake duration (s) when the player dies.',
  })
  public playerDeathShakeDuration = 0.28;

  @ENGINE.property({
    type: 'vfxPath',
    category: 'Hit Spark',
    description: 'VFX JSON path for the impact spark (@project / @engine).',
  })
  public hitSparkVfxPath = DEFAULT_HIT_SPARK_VFX;

  @ENGINE.property({
    type: 'number',
    category: 'Hit Spark',
    min: 0.1,
    max: 5,
    step: 0.05,
    description: 'Uniform scale of the hit-spark VFX.',
  })
  public hitSparkScale = 1.85;

  public override getEditorClassIcon(): string | null {
    return 'Icon_Vfx';
  }
}
