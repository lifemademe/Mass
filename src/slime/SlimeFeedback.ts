import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { SlimeShockwaveNode } from './SlimeJuiceNodes.js';

export type SlimeFeedbackEvent =
  | 'attach'
  | 'release'
  | 'land'
  | 'split'
  | 'biomass'
  | 'sense'
  | 'reunion'
  | 'switch'
  | 'stage'
  | 'complete';

interface SlimeSoundCue {
  url: string;
  volume: number;
  global?: boolean;
}

interface SlimeVfxCue {
  path: string;
  scale: number;
}

const SOUND_CUES: Record<SlimeFeedbackEvent, SlimeSoundCue> = {
  attach: { url: '@project/assets/audio/jump.wav', volume: 0.2 },
  release: { url: '@project/assets/audio/land.wav', volume: 0.22 },
  land: { url: '@project/assets/audio/land.wav', volume: 0.3 },
  split: { url: '@project/assets/audio/sword-swing.wav', volume: 0.28 },
  biomass: { url: '@project/assets/audio/pickup.wav', volume: 0.68 },
  sense: { url: '@project/assets/audio/checkpoint.wav', volume: 0.24 },
  reunion: { url: '@project/assets/audio/checkpoint.wav', volume: 0.55 },
  switch: { url: '@project/assets/audio/checkpoint.wav', volume: 0.48 },
  stage: { url: '@project/assets/audio/checkpoint.wav', volume: 0.7, global: true },
  complete: { url: '@project/assets/audio/level-complete.wav', volume: 0.82, global: true },
};

const SLIME_BURST = '@project/assets/vfx/slime-burst.vfx.json';
const AMBER_BURST = '@project/assets/vfx/hit-spark.vfx.json';

const VFX_CUES: Partial<Record<SlimeFeedbackEvent, SlimeVfxCue>> = {
  attach: { path: SLIME_BURST, scale: 0.34 },
  release: { path: SLIME_BURST, scale: 0.22 },
  land: { path: SLIME_BURST, scale: 0.32 },
  split: { path: SLIME_BURST, scale: 0.72 },
  biomass: { path: AMBER_BURST, scale: 0.6 },
  sense: { path: SLIME_BURST, scale: 0.3 },
  reunion: { path: SLIME_BURST, scale: 1.05 },
  switch: { path: AMBER_BURST, scale: 0.48 },
  stage: { path: SLIME_BURST, scale: 1.2 },
  complete: { path: SLIME_BURST, scale: 1.65 },
};

export class SlimeFeedbackSystem {
  private world: ENGINE.World | null = null;
  private audio: ENGINE.GlobalAudioManager | null = null;
  private readonly celebrationTimers = new Set<ReturnType<typeof setTimeout>>();

  public bind(world: ENGINE.World): void {
    this.unbind();
    this.world = world;
    this.audio = ENGINE.GlobalAudioManager.getInstance();
    this.audio.setWorld(world);
    void this.preloadSounds();
  }

  public unbind(): void {
    for (const timer of this.celebrationTimers) clearTimeout(timer);
    this.celebrationTimers.clear();
    this.audio?.setWorld(null);
    this.audio = null;
    this.world = null;
  }

  public emit(event: SlimeFeedbackEvent, position: THREE.Vector3): void {
    this.playSound(event, position);
    if (event === 'complete') this.spawnCompletionSequence(position);
    else this.spawnVfx(event, position);
    if (event === 'land') this.spawnShockwave(position, 0x75ffd3, 1.15, 0.42);
    else if (event === 'reunion') this.spawnShockwave(position, 0x75ffd3, 2.1, 0.65);
    else if (event === 'stage') this.spawnShockwave(position, 0xc7ff9b, 2.5, 0.75);
    else if (event === 'complete') this.spawnShockwave(position, 0xd7f7b7, 3.2, 0.85);
  }

  private spawnShockwave(
    position: THREE.Vector3,
    color: THREE.ColorRepresentation,
    scale: number,
    lifetime: number,
  ): void {
    const world = this.world;
    if (!world) return;
    const shockwave = SlimeShockwaveNode.create({
      name: 'Slime Shockwave',
      position: position.clone().add(new THREE.Vector3(0, 0, 0.18)),
    });
    shockwave.configure(color, scale, lifetime);
    world.add(shockwave);
  }

  private spawnCompletionSequence(position: THREE.Vector3): void {
    this.spawnVfx('complete', position);
    const bursts = [
      { delay: 140, offset: new THREE.Vector3(-0.9, 0.55, 0) },
      { delay: 290, offset: new THREE.Vector3(0.95, 0.85, 0) },
      { delay: 460, offset: new THREE.Vector3(0, 1.45, 0) },
    ];
    for (const burst of bursts) {
      const timer = setTimeout(() => {
        this.celebrationTimers.delete(timer);
        this.spawnVfx('complete', position.clone().add(burst.offset));
      }, burst.delay);
      this.celebrationTimers.add(timer);
    }
  }

  private async preloadSounds(): Promise<void> {
    const audio = this.audio;
    if (!audio) return;
    const urls = [...new Set(Object.values(SOUND_CUES).map((cue) => cue.url))];
    await Promise.all(urls.map(async (url) => {
      try {
        await audio.loadSound(url, url);
      } catch (error) {
        console.warn(`[MassFeedback] Failed to preload ${url}:`, error);
      }
    }));
  }

  private playSound(event: SlimeFeedbackEvent, position: THREE.Vector3): void {
    const audio = this.audio;
    if (!audio) return;
    const cue = SOUND_CUES[event];
    if (cue.global) {
      void audio.playGlobalSound(cue.url, { volume: cue.volume, bus: 'SFX' });
      return;
    }
    void audio.playSoundAtPosition(cue.url, position, {
      volume: cue.volume,
      bus: 'SFX',
      maxDistance: 24,
      rolloffFactor: 1.25,
    });
  }

  private spawnVfx(event: SlimeFeedbackEvent, position: THREE.Vector3): void {
    const world = this.world;
    const cue = VFX_CUES[event];
    if (!world || !cue) return;
    const scale = new THREE.Vector3(cue.scale, cue.scale, cue.scale);
    void world.globalParticleManager.spawnVFXFromPath(cue.path, {
      position: position.clone(),
      scale,
    }).catch((error: unknown) => {
      console.warn(`[MassFeedback] Failed to spawn ${event} VFX:`, error);
    });
  }
}
