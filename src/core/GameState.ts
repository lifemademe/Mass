/**
 * GameState - runtime objective/progress state for the sample level.
 *
 * Owned by `Action2DGameMode` (one instance per play session). Survives player death /
 * respawn but is reset when the level (game mode) begins play, so defeated enemies stay
 * defeated after a respawn but reset on a fresh level load.
 */
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

/** High-level objective phases that drive HUD text and exit activation. */
export type ObjectivePhase = 'defeatEnemy' | 'reachExit' | 'complete';

/** Snapshot of the latest checkpoint the player should respawn at. */
export interface CheckpointData {
  id: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
}

/** Plain, JSON-serializable snapshot of a checkpoint (see {@link GameStateSaveData}). */
export interface CheckpointSaveData {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number, THREE.EulerOrder];
}

/**
 * Plain, JSON-serializable snapshot of the progress `GameState` tracks. Produced by
 * {@link GameState.toSaveData} / consumed by {@link GameState.applySaveData} — see
 * `GameStatePersistence` for an opt-in localStorage-backed persistence layer built on top of it.
 */
export interface GameStateSaveData {
  phase: ObjectivePhase;
  checkpoint: CheckpointSaveData | null;
  defeatedEnemies: string[];
}

export class GameState {
  /** Latest activated checkpoint, or null if none reached yet (respawn falls back to player start). */
  public checkpoint: CheckpointData | null = null;

  /** Current objective phase. */
  public phase: ObjectivePhase = 'defeatEnemy';

  /** Fires whenever `phase` changes (current phase). */
  public readonly onPhaseChanged = new ENGINE.Delegate<[ObjectivePhase]>();

  /** Fires when all registered enemies have been defeated. */
  public readonly onAllEnemiesDefeated = new ENGINE.Delegate<[]>();

  /** Enemy ids known to the level (registered on beginPlay). */
  private readonly registeredEnemies = new Set<string>();

  /** Enemy ids that have been defeated. Persists across respawns. */
  private readonly defeatedEnemies = new Set<string>();

  /** Register an enemy so the level knows how many must be defeated. */
  public registerEnemy(id: string): void {
    this.registeredEnemies.add(id);
  }

  /** Returns true if the given enemy was already defeated (used to keep it dead after respawn). */
  public isEnemyDefeated(id: string): boolean {
    return this.defeatedEnemies.has(id);
  }

  /** Mark an enemy defeated. Advances the objective once every registered enemy is down. */
  public markEnemyDefeated(id: string): void {
    if (this.defeatedEnemies.has(id)) return;
    this.defeatedEnemies.add(id);
    if (this.allEnemiesDefeated()) {
      this.onAllEnemiesDefeated.invoke();
      this.setPhase('reachExit');
    }
  }

  /** True when every registered enemy has been defeated. */
  public allEnemiesDefeated(): boolean {
    for (const id of this.registeredEnemies) {
      if (!this.defeatedEnemies.has(id)) return false;
    }
    return this.registeredEnemies.size > 0;
  }

  /** Update the checkpoint the player respawns at. */
  public setCheckpoint(data: CheckpointData): void {
    this.checkpoint = data;
  }

  /** Change the objective phase and notify listeners. */
  public setPhase(phase: ObjectivePhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.onPhaseChanged.invoke(phase);
  }

  /** Reset progress for a fresh level load. */
  public reset(): void {
    this.checkpoint = null;
    this.phase = 'defeatEnemy';
    this.registeredEnemies.clear();
    this.defeatedEnemies.clear();
  }

  /**
   * Plain, JSON-serializable snapshot of persistent progress (phase, checkpoint, defeated
   * enemies). `registeredEnemies` is intentionally excluded — enemies rebuild it themselves by
   * calling `registerEnemy` from their own `beginPlay` every level load.
   *
   * Nothing in the template calls this by default; it exists so a game can opt into persistence
   * (e.g. via `GameStatePersistence`) without `GameState` itself depending on `localStorage`.
   */
  public toSaveData(): GameStateSaveData {
    return {
      phase: this.phase,
      checkpoint: this.checkpoint
        ? {
            id: this.checkpoint.id,
            position: this.checkpoint.position.toArray() as [number, number, number],
            rotation: this.checkpoint.rotation.toArray() as unknown as [number, number, number, THREE.EulerOrder],
          }
        : null,
      defeatedEnemies: [...this.defeatedEnemies],
    };
  }

  /** Restore progress from a snapshot produced by {@link toSaveData}. */
  public applySaveData(data: GameStateSaveData): void {
    this.checkpoint = data.checkpoint
      ? {
          id: data.checkpoint.id,
          position: new THREE.Vector3().fromArray(data.checkpoint.position),
          rotation: new THREE.Euler().fromArray(data.checkpoint.rotation),
        }
      : null;
    this.defeatedEnemies.clear();
    for (const id of data.defeatedEnemies) this.defeatedEnemies.add(id);

    this.phase = data.phase;
    this.onPhaseChanged.invoke(this.phase); // Unconditional: HUD/listeners should refresh on load even if the phase value is unchanged.
  }
}
