/**
 * GameStatePersistence - optional localStorage persistence for `GameState`.
 *
 * `GameState` only knows how to turn itself into/from plain data (`toSaveData` /
 * `applySaveData`); this is the opt-in layer that actually writes that data somewhere.
 * Nothing in the template calls it — `GameState` still resets on every fresh level load by
 * default (see its class doc). To opt in, wire calls where it makes sense for your game, e.g.
 * in `Action2DGameMode`:
 *
 * ```ts
 * protected override doBeginPlay(): void {
 *   super.doBeginPlay();
 *   if (!GameStatePersistence.load(this.gameState)) this.gameState.reset();
 *   this.flow.bind(this.getWorld()!, this);
 *   // ...
 * }
 *
 * // Whenever progress should persist (checkpoint reached, enemy defeated, phase change):
 * GameStatePersistence.save(this.gameState);
 * ```
 *
 * Uses `window.localStorage`; every method fails soft (returns `false` / no-ops and logs a
 * warning) in environments without it — SSR, storage disabled, quota exceeded — rather than
 * throwing, so opting in never risks crashing play.
 */
import type { GameState } from './GameState.js';

const DEFAULT_STORAGE_KEY = 'genesys-2d-action-template:gameState';

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const GameStatePersistence = {
  /** Persist `gameState`'s progress under `key`. Returns true if the write succeeded. */
  save(gameState: GameState, key: string = DEFAULT_STORAGE_KEY): boolean {
    const storage = getStorage();
    if (!storage) return false;
    try {
      storage.setItem(key, JSON.stringify(gameState.toSaveData()));
      return true;
    } catch (error) {
      console.warn('GameStatePersistence: failed to save game state.', error);
      return false;
    }
  },

  /** Restore progress into `gameState` from a prior `save()`. Returns true if data was applied. */
  load(gameState: GameState, key: string = DEFAULT_STORAGE_KEY): boolean {
    const storage = getStorage();
    if (!storage) return false;
    const raw = storage.getItem(key);
    if (!raw) return false;
    try {
      gameState.applySaveData(JSON.parse(raw));
      return true;
    } catch (error) {
      console.warn('GameStatePersistence: failed to load game state, ignoring corrupt save.', error);
      return false;
    }
  },

  /** Remove any persisted save under `key`. */
  clear(key: string = DEFAULT_STORAGE_KEY): void {
    getStorage()?.removeItem(key);
  },
};
