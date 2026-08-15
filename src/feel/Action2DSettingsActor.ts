/**
 * Scene-editable home for the template's combat-feel and feedback-audio settings.
 *
 * Place one instance in each level and select it in the Outliner to tune its
 * child settings components from the Inspector.
 */
import * as ENGINE from '@gnsx/genesys.js';

import { CombatFeelSettingsComponent } from './CombatFeelSettingsComponent.js';
import { SoundFeedbackSettingsComponent } from './SoundFeedbackSettingsComponent.js';

@ENGINE.GameClass()
export class Action2DSettingsActor extends ENGINE.SceneNode {
  private combatFeelSettings!: CombatFeelSettingsComponent;
  private soundFeedbackSettings!: SoundFeedbackSettingsComponent;

  constructor() {
    super();
    this.isRoot = true;
  }

  public static get(world: ENGINE.World | null | undefined): Action2DSettingsActor | null {
    return world?.getNodes(Action2DSettingsActor)[0] ?? null;
  }

  public override initialize(options?: ENGINE.SceneNodeOptions): void {
    super.initialize(options);

    const existingCombatFeel = this.getNode(CombatFeelSettingsComponent);
    if (existingCombatFeel) {
      this.combatFeelSettings = existingCombatFeel;
    } else {
      this.combatFeelSettings = CombatFeelSettingsComponent.create({ name: 'CombatFeelSettings' });
      this.add(this.combatFeelSettings);
    }

    const existingSoundFeedback = this.getNode(SoundFeedbackSettingsComponent);
    if (existingSoundFeedback) {
      this.soundFeedbackSettings = existingSoundFeedback;
    } else {
      this.soundFeedbackSettings = SoundFeedbackSettingsComponent.create({ name: 'SoundFeedbackSettings' });
      this.add(this.soundFeedbackSettings);
    }
  }

  public getCombatFeelSettings(): CombatFeelSettingsComponent {
    return this.combatFeelSettings;
  }

  public getSoundFeedbackSettings(): SoundFeedbackSettingsComponent {
    return this.soundFeedbackSettings;
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_Actor';
  }
}
