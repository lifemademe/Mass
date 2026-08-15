/**
 * SoundFeedbackBinder - template audio layer driven by the shared feedback hub.
 *
 * Games built on this template can:
 *   - swap WAV files under `@project/assets/audio/` (keep the filenames), or
 *   - edit {@link SoundFeedbackSettingsComponent} on the scene settings actor, or
 *   - fork/extend {@link DEFAULT_EVENT_SOUNDS} for a different event → clip map.
 *
 * No gameplay class imports audio paths directly (except optional ambient loops like
 * enemy nearby, which still use a shared constant from this module).
 */
import * as ENGINE from '@gnsx/genesys.js';

import type { FeedbackEvent, FeedbackPayload } from '../core/FeedbackEvents.js';
import { feedback } from '../core/FeedbackEvents.js';

import {
  DEFAULT_EVENT_SOUNDS,
  SoundFeedbackSettingsComponent,
  TEMPLATE_AUDIO,
} from './SoundFeedbackSettingsComponent.js';

import type { SoundCue } from './SoundFeedbackSettingsComponent.js';

export { DEFAULT_EVENT_SOUNDS, TEMPLATE_AUDIO };
export type { SoundCue };

export class SoundFeedbackBinder {
  private world: ENGINE.World | null = null;
  private audio: ENGINE.GlobalAudioManager | null = null;
  private eventSounds: Partial<Record<FeedbackEvent, SoundCue>>;
  private readonly onEvent = (event: FeedbackEvent, payload: FeedbackPayload): void => {
    this.handle(event, payload);
  };

  public constructor(eventSounds: Partial<Record<FeedbackEvent, SoundCue>> = DEFAULT_EVENT_SOUNDS) {
    this.eventSounds = eventSounds;
  }

  public bind(world: ENGINE.World, settings?: SoundFeedbackSettingsComponent | null): void {
    this.unbind();
    this.world = world;
    this.eventSounds = settings?.getEventSounds() ?? this.eventSounds;
    this.audio = ENGINE.GlobalAudioManager.getInstance();
    this.audio.setWorld(world);
    feedback.onEvent.add(this.onEvent);
    void this.preload();
  }

  public unbind(): void {
    feedback.onEvent.remove(this.onEvent);
    this.audio?.setWorld(null);
    this.audio = null;
    this.world = null;
  }

  private async preload(): Promise<void> {
    const audio = this.audio;
    if (!audio) return;
    const urls = [...new Set(Object.values(this.eventSounds).map((cue) => cue.url))];
    await Promise.all(urls.map(async (url) => {
      try {
        await audio.loadSound(url, url);
      } catch (error) {
        console.warn(`[SoundFeedback] Failed to preload ${url}:`, error);
      }
    }));
  }

  private handle(event: FeedbackEvent, payload: FeedbackPayload): void {
    const cue = this.eventSounds[event];
    const audio = this.audio;
    if (!cue || !audio) return;

    const options = { volume: cue.volume ?? 1, bus: 'SFX' };
    if (cue.positional && payload.position) {
      void audio.playSoundAtPosition(cue.url, payload.position, {
        ...options,
        maxDistance: 28,
        rolloffFactor: 1.4,
      });
      return;
    }
    void audio.playGlobalSound(cue.url, options);
  }
}

/** Shared ambient path for proximity loops (enemies, hazards, etc.). */
export const ENEMY_NEARBY_SOUND_URL = TEMPLATE_AUDIO.enemyNearby;
