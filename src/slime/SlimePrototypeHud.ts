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
  stretch: { title: 'Reach', body: 'Aim at the glowing growth and hold the mouse to stretch.' },
  feed: { title: 'Feed', body: 'Cross the pit and absorb the amber biomass.' },
  split: { title: 'Become small', body: 'Hold Space, shed at least 80 mass, then pass beneath the grate.' },
  sense: { title: 'Call it home', body: 'The switch opened the route. Press Q to awaken your abandoned piece.' },
  escape: { title: 'Restore yourself', body: 'Reunite, then use the high growth to reach the exit.' },
  complete: { title: 'Prototype complete', body: 'Mass conserved. Press R to replay the room.' },
};

export class SlimePrototypeHud {
  private massBar: ENGINE.ProgressBar | null = null;
  private chargeBar: ENGINE.ProgressBar | null = null;
  private objective: ENGINE.Card | null = null;
  private controls: ENGINE.ControlsPanel | null = null;
  private banner: ENGINE.CenterMessage | null = null;

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
      title: 'Controls',
      controls: [
        { key: 'A / D', description: 'Move' },
        { key: 'Mouse', description: 'Aim at growths' },
        { key: 'LMB', description: 'Stretch / release' },
        { key: 'Space', description: 'Charge / split' },
        { key: 'Q', description: 'Slime sense' },
        { key: 'R', description: 'Restart' },
      ],
    });
    this.banner = new ENGINE.CenterMessage(ui, {});
    await Promise.all([
      this.massBar.initialize(), this.chargeBar.initialize(), this.objective.initialize(),
      this.controls.initialize(), this.banner.initialize(),
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
    const copy = PHASE_COPY[phase];
    this.objective?.setTitle(copy.title);
    this.objective?.setBody(copy.body);
    if (phase === 'complete') {
      this.banner?.show({ title: 'Room escaped', subtitle: 'Press R to replay', color: '#75ffd3', duration: 0 });
    }
  }

  public destroy(): void {
    this.massBar?.destroy();
    this.chargeBar?.destroy();
    this.objective?.destroy();
    this.controls?.destroy();
    this.banner?.destroy();
    this.massBar = null;
    this.chargeBar = null;
    this.objective = null;
    this.controls = null;
    this.banner = null;
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
}
