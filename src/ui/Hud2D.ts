/**
 * Hud2D - screen-space HUD for the sample level, built from engine UI Kit widgets.
 *
 * Kit surfaces (Card / ControlsPanel / Achievement) for contrast. Each widget sits in a
 * full-viewport transparent layer; chips are absolutely pinned so they stay compact.
 */
import * as ENGINE from '@gnsx/genesys.js';

import type { FeedbackEvent, FeedbackPayload } from '../core/FeedbackEvents.js';
import { feedback } from '../core/FeedbackEvents.js';
import type { GameState, ObjectivePhase } from '../core/GameState.js';
import type { PlayerHealthComponent } from '../player/PlayerHealthComponent.js';

/** Compact panel chrome (kit tokens) applied to the widget root, not the layout wrapper. */
const CHIP_PANEL: Record<string, string> = {
  'background-color': '#2a2d44',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  'border-radius': '12px',
  padding: '10px 12px',
  'box-shadow': '0 4px 10px rgba(0, 0, 0, 0.3)',
  'box-sizing': 'border-box',
};

/**
 * Full-viewport transparent layer per widget. Chips position against this, so `right` /
 * `left: 50%` resolve to the screen — not a 0×0 box (which shoved everything off-screen).
 */
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
  'box-shadow': 'none',
};

const OBJECTIVE_COPY: Record<ObjectivePhase, { title: string; body: string }> = {
  defeatEnemy: { title: 'Objective', body: 'Defeat all enemies' },
  reachExit: { title: 'Objective', body: 'Reach the exit' },
  complete: { title: 'Complete!', body: 'Press R to restart' },
};

const TOAST_META: Partial<Record<FeedbackEvent, { title: string; rarity: ENGINE.AchievementRarity }>> = {
  checkpoint: { title: 'Checkpoint', rarity: 'uncommon' },
  pickup: { title: 'Pickup', rarity: 'rare' },
  exitActivated: { title: 'Exit open', rarity: 'epic' },
};

export class Hud2D {
  private readonly world: ENGINE.World;
  private readonly gameState: GameState;

  private healthBar: ENGINE.ProgressBar | null = null;
  private objective: ENGINE.Card | null = null;
  private controls: ENGINE.ControlsPanel | null = null;
  private toast: ENGINE.Achievement | null = null;
  private banner: ENGINE.CenterMessage | null = null;

  private health: PlayerHealthComponent | null = null;
  private ready = false;

  private readonly onFeedback = (event: FeedbackEvent, payload: FeedbackPayload) => this.handleFeedback(event, payload);
  private readonly onPhaseChanged = (phase: ObjectivePhase) => this.updateObjective(phase);
  private readonly onHealthChanged = (current: number, max: number) => this.updateHealth(current, max);

  constructor(world: ENGINE.World, gameState: GameState) {
    this.world = world;
    this.gameState = gameState;
  }

  public async initialize(): Promise<void> {
    const ui = this.world.uiManager;

    this.healthBar = new ENGINE.ProgressBar(ui, {
      ...ENGINE.ProgressBar.presets.health,
      position: 'none',
      label: 'Health',
      currentValue: 100,
      maxValue: 100,
      textDisplay: 'value',
      width: 180,
    });

    this.objective = new ENGINE.Card(ui, {
      ...ENGINE.Card.presets.elevated,
      position: 'none',
      title: 'Objective',
      body: '',
    });

    this.controls = new ENGINE.ControlsPanel(ui, {
      position: 'none',
      title: 'Controls',
      controls: [
        { key: 'A/D', description: 'Move' },
        { key: 'Space', description: 'Jump' },
        { key: 'J', description: 'Attack' },
        { key: 'R', description: 'Respawn / restart' },
      ],
    });

    // Bottom-right so it doesn't fight the controls chip at top-right.
    this.toast = new ENGINE.Achievement(ui, {
      position: 'none',
      visible: false,
    });

    this.banner = new ENGINE.CenterMessage(ui, {});

    await Promise.all([
      this.healthBar.initialize(),
      this.objective.initialize(),
      this.controls.initialize(),
      this.toast.initialize(),
      this.banner.initialize(),
    ]);

    this.layoutHudChips();
    this.updateObjective(this.gameState.phase);
    this.toast.hide();

    this.ready = true;
    if (this.health) this.updateHealth(this.health.getCurrentHealth(), this.health.getMaxHealth());

    feedback.onEvent.add(this.onFeedback);
    this.gameState.onPhaseChanged.add(this.onPhaseChanged);
  }

  /** Pin compact chips inside full-viewport layers (no full-bleed document banners). */
  private layoutHudChips(): void {
    this.healthBar?.setPosition(VIEWPORT_LAYER);
    this.healthBar?.setPosition(
      {
        position: 'absolute',
        top: '52px',
        left: '16px',
        width: '180px',
        'pointer-events': 'auto',
        ...CHIP_PANEL,
      },
      '.ui-progress-bar',
    );

    // Stack under health on the left — compact card, not a centered full-width strip.
    this.objective?.setPosition(VIEWPORT_LAYER);
    this.objective?.setPosition(
      {
        position: 'absolute',
        top: '122px',
        left: '16px',
        width: 'max-content',
        'max-width': '220px',
        'pointer-events': 'none',
        padding: '10px 14px',
      },
      '.ui-card',
    );

    this.controls?.setPosition(VIEWPORT_LAYER);
    this.controls?.setCustomPosition({
      top: '52px',
      right: '16px',
      left: 'auto',
      bottom: 'auto',
      'pointer-events': 'none',
    });

    this.toast?.setPosition(VIEWPORT_LAYER);
    this.toast?.setPosition(
      {
        position: 'absolute',
        right: '16px',
        bottom: '16px',
        top: 'auto',
        left: 'auto',
        'pointer-events': 'auto',
      },
      '.ui-achievement',
    );
  }

  /** Bind the player's health component so the bar tracks it. */
  public bindPlayerHealth(health: PlayerHealthComponent): void {
    if (this.health) this.health.onHealthChanged.remove(this.onHealthChanged);
    this.health = health;
    health.onHealthChanged.add(this.onHealthChanged);
    if (this.ready) this.updateHealth(health.getCurrentHealth(), health.getMaxHealth());
  }

  private updateHealth(current: number, max: number): void {
    if (!this.healthBar) return;
    this.healthBar.setMaxValue(max);
    this.healthBar.setValue(current);
  }

  private updateObjective(phase: ObjectivePhase): void {
    const copy = OBJECTIVE_COPY[phase];
    this.objective?.setTitle(copy.title);
    this.objective?.setBody(copy.body);
  }

  private handleFeedback(event: FeedbackEvent, payload: FeedbackPayload): void {
    switch (event) {
      case 'checkpoint':
      case 'pickup':
      case 'exitActivated':
        this.showToast(event, payload.message);
        break;
      case 'levelComplete':
        this.banner?.show({
          title: 'Level Complete!',
          subtitle: 'Press R to restart',
          color: '#7cc8ff',
          duration: 0,
        });
        break;
      case 'playerDeath':
        this.banner?.show({
          title: 'You Died',
          subtitle: 'Press R to continue',
          color: '#dc4040',
          duration: 0,
        });
        break;
      case 'respawn':
        this.banner?.hide();
        break;
      default:
        break;
    }
  }

  private showToast(event: FeedbackEvent, message?: string): void {
    if (!this.toast) return;
    const meta = TOAST_META[event];
    if (!meta) return;
    this.toast.show({
      ...ENGINE.Achievement.presets[meta.rarity],
      title: meta.title,
      description: message ?? '',
      duration: 2800,
    });
  }

  public destroy(): void {
    feedback.onEvent.remove(this.onFeedback);
    this.gameState.onPhaseChanged.remove(this.onPhaseChanged);
    this.health?.onHealthChanged.remove(this.onHealthChanged);
    this.healthBar?.destroy();
    this.objective?.destroy();
    this.controls?.destroy();
    this.toast?.destroy();
    this.banner?.destroy();
    this.healthBar = null;
    this.objective = null;
    this.controls = null;
    this.toast = null;
    this.banner = null;
    this.ready = false;
  }
}
