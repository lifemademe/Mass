/**
 * CombatFeedbackBinder - turns gameplay feedback events into hit-stop, shake, and sparks.
 *
 * Owned by `Action2DGameMode`: subscribe on beginPlay, unsubscribe on endPlay. Keeps juice out
 * of individual combat/enemy classes so final projects can swap the binder without touching them.
 * Tunables live on {@link CombatFeelSettingsComponent}.
 */
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import type { FeedbackEvent, FeedbackPayload } from '../core/FeedbackEvents.js';
import { feedback } from '../core/FeedbackEvents.js';

import { combatFeel } from './CombatFeel.js';
import { CombatFeelSettingsComponent } from './CombatFeelSettingsComponent.js';

const DEFAULT_HIT_SPARK_VFX = '@project/assets/vfx/hit-spark.vfx.json';

export class CombatFeedbackBinder {
  private world: ENGINE.World | null = null;
  private settings: CombatFeelSettingsComponent | null = null;
  private readonly onEvent = (event: FeedbackEvent, payload: FeedbackPayload): void => {
    this.handle(event, payload);
  };

  public bind(world: ENGINE.World, settings?: CombatFeelSettingsComponent | null): void {
    this.unbind();
    this.world = world;
    this.settings = settings ?? null;
    feedback.onEvent.add(this.onEvent);
  }

  public unbind(): void {
    feedback.onEvent.remove(this.onEvent);
    this.world = null;
    this.settings = null;
    combatFeel.endDamageBlink();
  }

  private handle(event: FeedbackEvent, payload: FeedbackPayload): void {
    const s = this.settings;
    switch (event) {
      case 'attackHit':
        // Prefer attackHit over hitSpark/enemyDamage — those also fire on the same frame.
        combatFeel.requestHitStop(s?.attackHitStop ?? 0.045);
        combatFeel.requestShake(
          s?.attackHitShakeAmplitude ?? 0.1,
          s?.attackHitShakeDuration ?? 0.12,
        );
        this.spawnSpark(payload.position);
        break;
      case 'playerDamage':
        combatFeel.requestHitStop(s?.playerDamageHitStop ?? 0.07);
        combatFeel.requestShake(
          s?.playerDamageShakeAmplitude ?? 0.22,
          s?.playerDamageShakeDuration ?? 0.2,
        );
        combatFeel.beginDamageBlink();
        break;
      case 'invulnEnd':
      case 'respawn':
        combatFeel.endDamageBlink();
        break;
      case 'enemyDeath':
        combatFeel.requestHitStop(s?.enemyDeathHitStop ?? 0.09);
        combatFeel.requestShake(
          s?.enemyDeathShakeAmplitude ?? 0.16,
          s?.enemyDeathShakeDuration ?? 0.22,
        );
        break;
      case 'playerDeath':
        // Corpse stays solid — never keep invuln blink after death.
        combatFeel.endDamageBlink();
        combatFeel.requestHitStop(s?.playerDeathHitStop ?? 0.12);
        combatFeel.requestShake(
          s?.playerDeathShakeAmplitude ?? 0.28,
          s?.playerDeathShakeDuration ?? 0.28,
        );
        break;
      default:
        break;
    }
  }

  private spawnSpark(position?: THREE.Vector3): void {
    const world = this.world;
    if (!world || !position) return;
    const path = this.settings?.hitSparkVfxPath || DEFAULT_HIT_SPARK_VFX;
    const scale = this.settings?.hitSparkScale ?? 1.85;
    void world.globalParticleManager.spawnVFXFromPath(path, {
      position: position.clone(),
      scale: new THREE.Vector3(scale, scale, scale),
    }).catch((error: unknown) => {
      console.warn('[CombatFeedback] Failed to spawn hit spark:', error);
    });
  }
}
