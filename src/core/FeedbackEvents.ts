/**
 * FeedbackEvents - central, replaceable feedback hooks for the 2D action template.
 *
 * Every gameplay system emits through the shared `feedback` hub instead of hard-wiring
 * audio/VFX. Final projects can subscribe to `feedback.onEvent` (or swap the default
 * placeholder visuals) without touching gameplay code.
 *
 * Default visuals are intentionally light (soft vignette accents). Punchier combat juice
 * lives in `CombatFeedbackBinder` (hit-stop, shake, sparks, sprite blink).
 */
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

/** Every feedback hook required by the technical brief. */
export type FeedbackEvent =
  | 'jump'
  | 'land'
  | 'footstep'
  | 'attackStart'
  | 'attackHit'
  | 'attackCancel'
  | 'attackMiss'
  | 'hitSpark'
  | 'enemyDamage'
  | 'enemyAttack'
  | 'enemyDeath'
  /** Generic vanish / poof moment (enemies, breakables, etc.). */
  | 'despawn'
  | 'playerDamage'
  | 'invulnStart'
  | 'invulnEnd'
  | 'playerDeath'
  | 'respawn'
  | 'pickup'
  | 'checkpoint'
  | 'exitActivated'
  | 'levelComplete';

/** Optional context passed with a feedback event. */
export interface FeedbackPayload {
  /** World-space location the event happened at (impact point, pickup position, ...). */
  position?: THREE.Vector3;
  /** Numeric magnitude (damage dealt, heal amount, ...). */
  amount?: number;
  /** Human-readable message (objective text, notification body, ...). */
  message?: string;
}

/** Soft vignette accents — combat impact is handled by CombatFeedbackBinder. */
const FLASH_COLORS: Partial<Record<FeedbackEvent, string>> = {
  playerDamage: 'rgba(220, 40, 40, 0.22)',
  playerDeath: 'rgba(180, 20, 20, 0.35)',
  pickup: 'rgba(80, 220, 120, 0.28)',
  levelComplete: 'rgba(120, 200, 255, 0.32)',
};

/**
 * Multicast feedback hub. A single module-level instance (`feedback`) is shared by the
 * whole template so any system can emit and the HUD (or final VFX layer) can listen.
 */
class FeedbackHub {
  /** Subscribe here to react to any feedback event (HUD, audio, VFX, screenshake, ...). */
  public readonly onEvent = new ENGINE.Delegate<[FeedbackEvent, FeedbackPayload]>();

  private world: ENGINE.World | null = null;
  private flashElement: HTMLElement | null = null;

  /** Bind the active world so placeholder visuals can mount to `gameContainer`. */
  public setWorld(world: ENGINE.World | null): void {
    if (this.world === world) return;
    this.disposeFlashElement();
    this.world = world;
  }

  /** Emit a feedback event: logs it, runs the default placeholder visual, notifies listeners. */
  public emit(event: FeedbackEvent, payload: FeedbackPayload = {}): void {
    console.debug(`[Feedback] ${event}`, payload);
    this.playDefaultVisual(event);
    this.onEvent.invoke(event, payload);
  }

  private playDefaultVisual(event: FeedbackEvent): void {
    const color = FLASH_COLORS[event];
    if (!color) return;
    const container = this.world?.gameContainer;
    if (!container) return;

    const flash = this.ensureFlashElement(container);
    flash.style.transition = 'none';
    flash.style.background = `radial-gradient(ellipse at center, transparent 35%, ${color} 100%)`;
    flash.style.opacity = '1';
    void flash.offsetWidth;
    flash.style.transition = 'opacity 0.28s ease-out';
    flash.style.opacity = '0';
  }

  private ensureFlashElement(container: HTMLElement): HTMLElement {
    if (this.flashElement && this.flashElement.parentElement === container) {
      return this.flashElement;
    }
    this.disposeFlashElement();
    const flash = document.createElement('div');
    flash.style.position = 'absolute';
    flash.style.inset = '0';
    flash.style.pointerEvents = 'none';
    flash.style.opacity = '0';
    flash.style.zIndex = '5';
    container.appendChild(flash);
    this.flashElement = flash;
    return flash;
  }

  private disposeFlashElement(): void {
    this.flashElement?.remove();
    this.flashElement = null;
  }
}

/** Shared feedback hub used across the whole template. */
export const feedback = new FeedbackHub();
