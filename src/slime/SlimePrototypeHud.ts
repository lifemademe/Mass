import * as ENGINE from '@gnsx/genesys.js';

import type { MassSnapshot } from './MassLedger.js';
import type { PrototypePhase } from './SlimeRuntime.js';

const VIEWPORT_LAYER: Record<string, string> = {
  position: 'absolute',
  inset: '0',
  width: '100%',
  height: '100%',
  margin: '0',
  padding: '0',
  overflow: 'visible',
  'pointer-events': 'none',
  'background-color': 'transparent',
  border: 'none',
};

const PANEL: Record<string, string> = {
  'background-color': 'rgba(18, 31, 29, 0.9)',
  border: '1px solid rgba(117, 255, 211, 0.22)',
  'border-radius': '12px',
  padding: '10px 12px',
  'box-shadow': '0 6px 18px rgba(0, 0, 0, 0.35)',
};

const PHASE_COPY: Record<PrototypePhase, { title: string; body: string }> = {
  stretch: { title: 'Reach', body: 'Aim at the glowing growth, then hold LMB to attach.' },
  feed: { title: 'Feed', body: 'Cross the pit and absorb the amber biomass.' },
  split: { title: 'Become small', body: 'Hold Space, shed at least 80 mass, then pass beneath the grate.' },
  infiltrate: { title: 'Slip through', body: 'You are small enough. Pass below the grate and touch the living switch.' },
  sense: { title: 'Call it home', body: 'The switch opened the route. Press Q to awaken your abandoned piece.' },
  return: { title: 'Answer the call', body: 'Your shed mass is awake. Move near it and let it rejoin you.' },
  escape: { title: 'Rise', body: 'Use the high growth to swing onto the final ledge.' },
  vertical: {
    title: 'Wake the red growths',
    body: 'Chain from the left growth to the center sling, then slam the wall switch.',
  },
  verticalUnlocked: { title: 'The roots awaken', body: 'Release in focus time, aim, and catch each awakened growth.' },
  complete: { title: 'Whole again', body: 'The ruin remembers you.' },
};

const PHASE_CONTROLS: Record<PrototypePhase, Array<{ key: string; description: string }>> = {
  stretch: [
    { key: 'Mouse', description: 'Aim at the growth' },
    { key: 'LMB', description: 'Hold to attach' },
  ],
  feed: [
    { key: 'A / D', description: 'Build your swing' },
    { key: 'LMB', description: 'Release toward the ledge' },
  ],
  split: [
    { key: 'Space', description: 'Hold, then release to shed mass' },
  ],
  infiltrate: [
    { key: 'A / D', description: 'Slip beneath the grate' },
  ],
  sense: [
    { key: 'Q', description: 'Call the nearest piece home' },
  ],
  return: [
    { key: 'A / D', description: 'Meet the returning mass' },
  ],
  escape: [
    { key: 'LMB', description: 'Climb with the high growth' },
    { key: 'A / D', description: 'Swing onto the final ledge' },
  ],
  vertical: [
    { key: 'A / D', description: 'Pump each swing' },
    { key: 'LMB', description: 'Release, catch the sling, then slam' },
  ],
  verticalUnlocked: [
    { key: 'A / D', description: 'Choose and build orbit direction' },
    { key: 'LMB', description: 'Release, aim, and catch in focus time' },
  ],
  complete: [
    { key: 'R', description: 'Replay the room' },
  ],
};

export class SlimePrototypeHud {
  private massBar: ENGINE.ProgressBar | null = null;
  private chargeBar: ENGINE.ProgressBar | null = null;
  private objective: ENGINE.Card | null = null;
  private controls: ENGINE.ControlsPanel | null = null;
  private banner: ENGINE.CenterMessage | null = null;
  private milestone: ENGINE.Achievement | null = null;
  private gameplayVisible = true;
  private currentPhase: PrototypePhase = 'stretch';

  public constructor(private readonly world: ENGINE.World) {}

  public async initialize(): Promise<void> {
    const ui = this.world.uiManager;
    this.massBar = new ENGINE.ProgressBar(ui, {
      position: 'none', label: 'Controlled mass', currentValue: 100, maxValue: 100, textDisplay: 'custom', width: 230,
    });
    this.chargeBar = new ENGINE.ProgressBar(ui, {
      position: 'none', label: 'Mass to shed', currentValue: 0, maxValue: 100, textDisplay: 'custom', width: 230,
    });
    this.objective = new ENGINE.Card(ui, {
      ...ENGINE.Card.presets.elevated, position: 'none', title: 'Reach', body: PHASE_COPY.stretch.body,
    });
    this.controls = new ENGINE.ControlsPanel(ui, {
      position: 'none',
      title: 'Now',
      controls: PHASE_CONTROLS.stretch,
    });
    this.banner = new ENGINE.CenterMessage(ui, {});
    this.milestone = new ENGINE.Achievement(ui, {});
    await Promise.all([
      this.massBar.initialize(), this.chargeBar.initialize(), this.objective.initialize(),
      this.controls.initialize(), this.banner.initialize(), this.milestone.initialize(),
    ]);
    this.layout();
    this.chargeBar.hide();
  }

  public updateMass(snapshot: MassSnapshot): void {
    this.massBar?.setMaxValue(Math.max(snapshot.ownedMass, 1));
    this.massBar?.setValue(snapshot.controlledMass);
    this.massBar?.setCustomText(`${Math.round(snapshot.controlledMass)} / ${Math.round(snapshot.ownedMass)}`);
  }

  public updateCharge(amount: number, maximum: number, visible: boolean): void {
    if (!this.chargeBar) return;
    this.chargeBar.setMaxValue(Math.max(maximum, 1));
    this.chargeBar.setValue(amount);
    this.chargeBar.setCustomText(`${Math.round(amount)} mass`);
    if (visible) this.chargeBar.show();
    else this.chargeBar.hide();
  }

  public updatePhase(phase: PrototypePhase): void {
    const phaseChanged = phase !== this.currentPhase;
    this.currentPhase = phase;
    const copy = PHASE_COPY[phase];
    this.objective?.setTitle(copy.title);
    this.objective?.setBody(copy.body);
    if (phaseChanged) this.controls?.updateControls(PHASE_CONTROLS[phase]);
    if (!this.gameplayVisible) {
      this.hideGameplayComponents();
      return;
    }
    if (phase === 'complete') {
      this.massBar?.hide();
      this.chargeBar?.hide();
      this.objective?.hide();
      this.controls?.hide();
      this.banner?.show({
        title: 'ASCENDED',
        subtitle: 'The overgrowth carries your memory  •  Press R to replay',
        color: '#75ffd3',
        duration: 0,
      });
      return;
    }
    this.banner?.hide();
    this.massBar?.show();
    this.objective?.show();
    this.controls?.show();
  }

  public showReunionMilestone(): void {
    this.milestone?.show({
      ...ENGINE.Achievement.presets.epic,
      title: 'Mass reunited',
      description: 'Every piece answers the call.',
      duration: 3200,
    });
  }

  public setGameplayVisible(visible: boolean): void {
    this.gameplayVisible = visible;
    if (visible) this.updatePhase(this.currentPhase);
    else this.hideGameplayComponents();
  }

  public showStageIntro(): void {
    if (!this.gameplayVisible) return;
    this.banner?.show({
      title: 'STAGE II',
      subtitle: 'THE LIVING SHAFT',
      color: '#d7f7b7',
      duration: 2200,
    });
  }

  public showMomentumFailure(message: string): void {
    this.milestone?.show({
      ...ENGINE.Achievement.presets.common,
      title: 'The wall resists',
      description: message,
      duration: 2200,
    });
  }

  public showGrowthsAwakened(): void {
    this.milestone?.show({
      ...ENGINE.Achievement.presets.epic,
      title: 'Dormant roots awakened',
      description: 'The red growths now answer your mass.',
      duration: 3200,
    });
  }

  public destroy(): void {
    this.massBar?.destroy();
    this.chargeBar?.destroy();
    this.objective?.destroy();
    this.controls?.destroy();
    this.banner?.destroy();
    this.milestone?.destroy();
    this.massBar = null;
    this.chargeBar = null;
    this.objective = null;
    this.controls = null;
    this.banner = null;
    this.milestone = null;
  }

  private layout(): void {
    this.massBar?.setPosition(VIEWPORT_LAYER);
    this.massBar?.setPosition({ position: 'absolute', top: '48px', left: '16px', width: '230px', ...PANEL }, '.ui-progress-bar');
    this.chargeBar?.setPosition(VIEWPORT_LAYER);
    this.chargeBar?.setPosition({ position: 'absolute', top: '112px', left: '16px', width: '230px', ...PANEL }, '.ui-progress-bar');
    this.objective?.setPosition(VIEWPORT_LAYER);
    this.objective?.setPosition({ position: 'absolute', left: '16px', bottom: '18px', width: '300px', ...PANEL }, '.ui-card');
    this.controls?.setPosition(VIEWPORT_LAYER);
    this.controls?.setCustomPosition({ top: '48px', right: '16px', left: 'auto', bottom: 'auto' });
  }

  private hideGameplayComponents(): void {
    this.massBar?.hide();
    this.chargeBar?.hide();
    this.objective?.hide();
    this.controls?.hide();
    this.banner?.hide();
  }
}
