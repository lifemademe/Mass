/**
 * CombatFeel - shared hit-stop / screen-shake state for the 2D action template.
 *
 * Uses wall-clock freeze so hit-stop is independent of tick order (not engine time-scale).
 * Systems **opt in** by calling {@link isFrozen}; juice that must keep reading (shake, blink,
 * sparks, SFX) intentionally does not. Camera shake is sampled via {@link sampleShakeOffset}.
 *
 * ## Hit-stop participation
 *
 * Keep this table current when adding/removing `combatFeel.isFrozen()` checks.
 *
 * | System | During freeze |
 * | --- | --- |
 * | `PatrolComponent` | Full tick early-out |
 * | `AttackComponent` | Full tick early-out (phase / cooldown timers pause) |
 * | `PlatformerModeShared` | Sim early-out: return cloned sync (pose / velocity held) |
 * | `PlatformerPawn` | Skip anim-parameter update only; facing + blink still run |
 * | `SideScrollCameraComponent` | Pause follow damp; still `tick` shake + apply shake offset |
 * | Shake / invuln blink (`tick`, blink APIs) | Continue on real delta |
 * | `ContactDamage`, enemy death/despawn, audio binders | Do not consult freeze (by design) |
 *
 * Do **not** gate the whole game loop or a shared `SceneComponent` base on freeze — policies
 * differ (full stop vs partial). Prefer an explicit `if (combatFeel.isFrozen())` at the call site.
 */
import * as THREE from 'three';

const _shake = new THREE.Vector3();

class CombatFeelState {
  private freezeUntilMs = 0;
  private shakeAmplitude = 0;
  private shakeRemaining = 0;
  private shakeDuration = 0;
  private blinkActive = false;
  private blinkVisible = true;
  private blinkAccum = 0;
  private readonly blinkInterval = 0.07;

  /** Freeze simulation for `seconds` (extends an existing freeze if longer). */
  public requestHitStop(seconds: number): void {
    if (seconds <= 0) return;
    this.freezeUntilMs = Math.max(this.freezeUntilMs, performance.now() + seconds * 1000);
  }

  /**
   * Whether hit-stop is active (wall-clock). Opt-in per system — see file header table.
   * Update that table when adding or removing freeze checks.
   */
  public isFrozen(): boolean {
    return performance.now() < this.freezeUntilMs;
  }

  /** Add a decaying camera shake pulse. */
  public requestShake(amplitude: number, duration: number): void {
    if (amplitude <= 0 || duration <= 0) return;
    this.shakeAmplitude = Math.max(this.shakeAmplitude, amplitude);
    this.shakeDuration = Math.max(this.shakeDuration, duration);
    this.shakeRemaining = Math.max(this.shakeRemaining, duration);
  }

  /** Tick shake + invuln blink. Call once per frame with real delta (not frozen). */
  public tick(deltaTime: number): void {
    if (this.shakeRemaining > 0) {
      this.shakeRemaining = Math.max(0, this.shakeRemaining - deltaTime);
      if (this.shakeRemaining <= 0) {
        this.shakeAmplitude = 0;
        this.shakeDuration = 0;
      }
    }

    if (this.blinkActive) {
      this.blinkAccum += deltaTime;
      if (this.blinkAccum >= this.blinkInterval) {
        this.blinkAccum = 0;
        this.blinkVisible = !this.blinkVisible;
      }
    }
  }

  public sampleShakeOffset(): THREE.Vector3 {
    if (this.shakeRemaining <= 0 || this.shakeDuration <= 0 || this.shakeAmplitude <= 0) {
      return _shake.set(0, 0, 0);
    }
    const falloff = this.shakeRemaining / this.shakeDuration;
    const amp = this.shakeAmplitude * falloff * falloff;
    return _shake.set(
      (Math.random() * 2 - 1) * amp,
      (Math.random() * 2 - 1) * amp * 0.65,
      0,
    );
  }

  public beginDamageBlink(): void {
    this.blinkActive = true;
    this.blinkVisible = true;
    this.blinkAccum = 0;
  }

  public endDamageBlink(): void {
    this.blinkActive = false;
    this.blinkVisible = true;
    this.blinkAccum = 0;
  }

  public isBlinkVisible(): boolean {
    return this.blinkVisible;
  }

  public isBlinking(): boolean {
    return this.blinkActive;
  }
}

/** Shared combat-feel state used across movement, camera, and feedback. */
export const combatFeel = new CombatFeelState();
