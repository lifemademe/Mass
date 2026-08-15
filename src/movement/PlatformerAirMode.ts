/**
 * PlatformerAirMode - airborne side-on movement for the MoverComponent.
 *
 * Applies separate rising/falling gravity, scaled air control, variable-jump cut on early
 * release, and coyote-time jumps. Returns to `PlatformerGroundMode` when the KCC reports
 * ground contact. All heavy lifting lives in `PlatformerModeBase`.
 */
import { GROUND_MODE_NAME, PlatformerModeBase } from './PlatformerModeShared.js';

export class PlatformerAirMode extends PlatformerModeBase {
  constructor(config?: ConstructorParameters<typeof PlatformerModeBase>[0]) {
    // Transition back to the ground mode when the character becomes grounded.
    super(config, GROUND_MODE_NAME, true);
  }

  protected override isGround(): boolean {
    return false;
  }
}
