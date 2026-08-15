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
  'background-color': 'rgba(5, 17, 15, 0.91)',
  border: '1px solid rgba(173, 149, 79, 0.68)',
  'border-radius': '10px 18px 10px 16px',
  padding: '10px 12px',
  'box-shadow': '0 8px 26px rgba(0, 0, 0, 0.5), inset 0 0 22px rgba(113, 151, 62, 0.08)',
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
  private themeElement: HTMLStyleElement | null = null;

  public constructor(private readonly world: ENGINE.World) {}

  public async initialize(): Promise<void> {
    const ui = this.world.uiManager;
    this.massBar = new ENGINE.ProgressBar(ui, {
      position: 'none', label: 'MASS', currentValue: 100, maxValue: 100, textDisplay: 'custom', width: 260,
      fillColor: '#a9d84f', customClasses: ['mass-hud-meter'],
    });
    this.chargeBar = new ENGINE.ProgressBar(ui, {
      position: 'none', label: 'MASS TO SHED', currentValue: 0, maxValue: 100, textDisplay: 'custom', width: 230,
      fillColor: '#c9a34d', customClasses: ['mass-hud-charge'],
    });
    this.objective = new ENGINE.Card(ui, {
      ...ENGINE.Card.presets.elevated, position: 'none', title: 'Reach', body: PHASE_COPY.stretch.body,
      customClasses: ['mass-hud-objective'],
    });
    this.controls = new ENGINE.ControlsPanel(ui, {
      position: 'none',
      title: 'Now',
      controls: PHASE_CONTROLS.stretch,
      customClasses: ['mass-hud-controls'],
    });
    this.banner = new ENGINE.CenterMessage(ui, {});
    this.milestone = new ENGINE.Achievement(ui, {});
    await Promise.all([
      this.massBar.initialize(), this.chargeBar.initialize(), this.objective.initialize(),
      this.controls.initialize(), this.banner.initialize(), this.milestone.initialize(),
    ]);
    this.installTheme();
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

  public showCheckpoint(index: number): void {
    this.milestone?.show({
      ...ENGINE.Achievement.presets.common,
      title: `Root memory ${index} awakened`,
      description: 'A fall will return your mass to this bloom.',
      duration: 2400,
    });
  }

  public showFallRecovered(): void {
    this.milestone?.show({
      ...ENGINE.Achievement.presets.common,
      title: 'The roots remember',
      description: 'Your mass reforms at the last awakened bloom.',
      duration: 2200,
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
    this.themeElement?.remove();
    this.themeElement = null;
  }

  private layout(): void {
    this.massBar?.setPosition(VIEWPORT_LAYER);
    this.massBar?.setPosition({ position: 'absolute', top: '24px', left: '24px', width: '260px', ...PANEL }, '.ui-progress-bar');
    this.chargeBar?.setPosition(VIEWPORT_LAYER);
    this.chargeBar?.setPosition({ position: 'absolute', top: '116px', left: '86px', width: '220px', ...PANEL }, '.ui-progress-bar');
    this.objective?.setPosition(VIEWPORT_LAYER);
    this.objective?.setPosition({ position: 'absolute', left: '24px', bottom: '22px', width: '320px', ...PANEL }, '.ui-card');
    this.controls?.setPosition(VIEWPORT_LAYER);
    this.controls?.setCustomPosition({ top: '24px', right: '24px', left: 'auto', bottom: 'auto' });
  }

  private installTheme(): void {
    this.themeElement?.remove();
    const themeElement = document.createElement('style');
    this.themeElement = themeElement;
    themeElement.dataset.massHudTheme = 'true';
    themeElement.textContent = `
      .mass-hud-meter .ui-progress-bar,.mass-hud-meter.ui-progress-bar,
      .mass-hud-charge .ui-progress-bar,.mass-hud-charge.ui-progress-bar,
      .mass-hud-objective .ui-card,.mass-hud-objective.ui-card,
      .mass-hud-controls .ui-controls-panel,.mass-hud-controls.ui-controls-panel{
        color:#e9e3c9!important;background:linear-gradient(145deg,rgba(8,25,21,.95),rgba(3,11,10,.92))!important;
        border:1px solid rgba(165,137,69,.72)!important;box-shadow:0 10px 28px rgba(0,0,0,.5),inset 0 0 25px rgba(128,167,67,.07)!important;
        font-family:Georgia,'Times New Roman',serif!important;
      }
      .mass-hud-meter .ui-progress-bar,.mass-hud-meter.ui-progress-bar{padding-left:74px!important;min-height:62px!important;overflow:visible!important}
      .mass-hud-meter .ui-progress-bar::before,.mass-hud-meter.ui-progress-bar::before{
        content:'';position:absolute;left:-12px;top:-12px;width:72px;height:72px;border-radius:50% 46% 52% 48%;
        background:radial-gradient(circle at 35% 28%,#efffb3 0 5%,transparent 6%),radial-gradient(circle at 42% 38%,#182116 0 7%,transparent 8%),radial-gradient(circle at 65% 40%,#182116 0 7%,transparent 8%),radial-gradient(ellipse at 50% 70%,#07110b 0 7%,transparent 8%),radial-gradient(circle at 42% 35%,#b9e45b,#698634 65%,#263817 100%);
        border:4px solid #171b16;outline:1px solid rgba(177,146,73,.9);box-shadow:0 0 18px rgba(169,220,75,.35),inset 0 0 13px rgba(235,255,178,.32);
      }
      .mass-hud-meter .ui-progress-bar-track,.mass-hud-charge .ui-progress-bar-track{background:#152019!important;border:1px solid rgba(190,162,81,.38)!important;box-shadow:inset 0 2px 7px #000!important}
      .mass-hud-meter .ui-progress-bar-fill{background:linear-gradient(90deg,#54742d,#b5df57,#d8ed7f)!important;box-shadow:0 0 10px rgba(178,226,81,.46)!important}
      .mass-hud-charge .ui-progress-bar-fill{background:linear-gradient(90deg,#6f4c24,#d1a347)!important}
      .mass-hud-objective .ui-card-title,.mass-hud-controls .ui-controls-panel-title{color:#d9d09f!important;letter-spacing:.04em;text-transform:none!important}
      .mass-hud-objective .ui-card-body,.mass-hud-controls .ui-controls-panel-description{color:#b9c1ae!important;font-family:system-ui,sans-serif!important}
      .mass-hud-objective .ui-card::before,.mass-hud-objective.ui-card::before,.mass-hud-controls .ui-controls-panel::before,.mass-hud-controls.ui-controls-panel::before{
        content:'';position:absolute;inset:5px;pointer-events:none;border:1px solid rgba(91,126,64,.22);border-radius:7px 14px 8px 13px;
      }
      .mass-hud-controls .ui-controls-panel{max-width:min(360px,38vw)!important}
      @media(max-width:760px){.mass-hud-controls .ui-controls-panel{transform:scale(.86);transform-origin:top right}.mass-hud-objective .ui-card{max-width:270px!important}.mass-hud-meter .ui-progress-bar{transform:scale(.88);transform-origin:top left}}
    `;
    this.world.gameContainer?.appendChild(themeElement);
  }

  private hideGameplayComponents(): void {
    this.massBar?.hide();
    this.chargeBar?.hide();
    this.objective?.hide();
    this.controls?.hide();
    this.banner?.hide();
  }
}
