/**
 * PlatformerGroundMode - grounded side-on locomotion for the MoverComponent.
 *
 * Handles ground acceleration/deceleration, jump initiation (including buffered jumps
 * consumed on landing), and hands off to `PlatformerAirMode` the moment the KCC reports
 * no ground contact. All heavy lifting lives in `PlatformerModeBase`.
 */
import { AIR_MODE_NAME, PlatformerModeBase } from './PlatformerModeShared.js';

export class PlatformerGroundMode extends PlatformerModeBase {
  constructor(config?: ConstructorParameters<typeof PlatformerModeBase>[0]) {
    // Transition to the air mode when the character is no longer grounded.
    super(config, AIR_MODE_NAME, false);
  }

  protected override isGround(): boolean {
    return true;
  }
}
