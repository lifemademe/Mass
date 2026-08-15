/**
 * LevelFlowController - owns player-pawn spawning, checkpoint respawn, and level restart.
 *
 * Extracted from `Action2DGameMode` so the game mode itself stays thin wiring (HUD + feel
 * binders + `GameState`) while the actual spawn/respawn/restart flow lives in one place.
 * Same lifecycle shape as `CombatFeedbackBinder` / `SoundFeedbackBinder`: `bind()` on
 * `doBeginPlay`, `unbind()` on `doEndPlay`.
 */
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { PLATFORMER_COLLIDER_HALF_HEIGHT, PlatformerPawn } from '../player/PlatformerPawn.js';

import { feedback } from './FeedbackEvents.js';
import type { GameState } from './GameState.js';

/**
 * Hand-authored prefab capturing the tuned `Player` actor (grip offsets, weapon mesh, etc.).
 * Spawning from it (instead of `PlatformerPawn.create()`) lets edits made to the prefab carry
 * into Play, since the whole component tree is reconstructed from this file every spawn.
 */
const PLAYER_PREFAB_PATH = '@project/assets/prefabs/PlayerPrefab.prefab.json';

export class LevelFlowController {
  private world: ENGINE.World | null = null;
  private gameMode: ENGINE.GameMode | null = null;
  private playerPawn: PlatformerPawn | null = null;

  constructor(private readonly gameState: GameState) {}

  /** Bind the active world/game mode (call from `doBeginPlay`). */
  public bind(world: ENGINE.World, gameMode: ENGINE.GameMode): void {
    this.world = world;
    this.gameMode = gameMode;
  }

  /** Release references (call from `doEndPlay`). */
  public unbind(): void {
    this.world = null;
    this.gameMode = null;
    this.playerPawn = null;
  }

  /** Spawn the player pawn from the tuned prefab, falling back to class defaults. */
  public async spawnPlayerPawn(): Promise<ENGINE.Pawn> {
    try {
      return await ENGINE.spawnAsync<PlatformerPawn>(PLAYER_PREFAB_PATH);
    } catch (error) {
      console.warn(`LevelFlowController: failed to spawn ${PLAYER_PREFAB_PATH}, falling back to class defaults.`, error);
      return PlatformerPawn.create();
    }
  }

  /**
   * PlayerStart marks the character's feet (like a checkpoint marker); the pawn's origin is the
   * capsule center, so lift the spawn point by the capsule half-height — otherwise the capsule
   * spawns half-buried in the floor and the first ground sweep can tunnel through it.
   */
  public liftSpawnPosition(position: THREE.Vector3): THREE.Vector3 {
    const lifted = position.clone();
    lifted.y += PLATFORMER_COLLIDER_HALF_HEIGHT;
    return lifted;
  }

  /** Called by the player pawn once it is in the world and ready to be tracked. */
  public registerPlayerPawn(pawn: PlatformerPawn): void {
    this.playerPawn = pawn;
  }

  /** The player pawn currently tracked, if spawned. */
  public getPlayerPawn(): PlatformerPawn | null {
    return this.playerPawn;
  }

  /**
   * R input: after level complete, hard-reload the active scene; otherwise checkpoint respawn
   * (alive = force respawn, dead = continue).
   */
  public handleRespawnInput(): void {
    if (this.gameState.phase === 'complete') {
      this.restartLevel();
      return;
    }
    this.respawnPlayer();
  }

  /** Respawn the currently tracked player pawn (R while alive = force respawn; R while dead = continue). */
  public respawnPlayer(): void {
    if (this.playerPawn) this.respawnAtCheckpoint(this.playerPawn);
  }

  /**
   * Hard restart: reload the active scene through the game loop so actors / GameState /
   * one-shots come back from the scene file (same path as a fresh Play).
   *
   * `preserveRoots: false` is required here: `openLevel` defaults to carrying the current
   * `PlayerController`(s) across the reload, and `World.getActiveCamera()` falls back to
   * `playerControllers[0]`. Without this flag the preserved controller stays at index 0 —
   * still pointing at the destroyed pawn/camera from before the restart — while the fresh
   * controller the new level spawns ends up unused for rendering, so the view sticks on the
   * old (frozen) camera pose instead of following the new pawn.
   */
  public restartLevel(): void {
    const world = this.world;
    const gameLoop = world?.gameLoop;
    if (!gameLoop) {
      console.warn('LevelFlowController: cannot restart — no game loop on world.');
      return;
    }

    // World.endPlay() only detachFromWorld()s NetWorld — it does not endPlay/reset it.
    // NetWorld is GameLoop-scoped and reused across openLevel, so without this the next
    // World.beginPlay → netWorld.beginPlay() fails the NotStarted PlayState ensure.
    this.resetNetWorldForLevelReload(world);

    const activePath = gameLoop.activeScenePath?.asStringPath;
    if (activePath) {
      void gameLoop.openLevel(activePath, { preserveRoots: false });
      return;
    }

    void gameLoop.reloadInitialLevel({ preserveRoots: false });
  }

  /**
   * Return the shared {@link ENGINE.NetWorld} to {@link ENGINE.PlayState.NotStarted} before a
   * cold level reload. Safe to call while the current world is still Playing.
   */
  private resetNetWorldForLevelReload(world: ENGINE.World | null): void {
    const netWorld = world?.netWorld;
    if (!netWorld) return;
    if (netWorld.isPlaying()) {
      netWorld.endPlay();
      return;
    }
    if (netWorld.isPlayEnded()) {
      netWorld.resetPlayStateForWorldTransition();
    }
  }

  /**
   * Respawn the player at the latest checkpoint (or player start if none), restoring full
   * health, zeroing velocity, and snapping the camera. Defeated enemies stay defeated.
   */
  public respawnAtCheckpoint(pawn: PlatformerPawn): void {
    const target = this.resolveRespawnTransform(pawn);
    pawn.resetForRespawn(target.position, target.rotation);
    feedback.emit('respawn', { position: target.position.clone() });
  }

  private resolveRespawnTransform(pawn: PlatformerPawn): { position: THREE.Vector3; rotation: THREE.Euler } {
    const checkpoint = this.gameState.checkpoint;
    if (checkpoint) {
      return { position: checkpoint.position.clone(), rotation: checkpoint.rotation.clone() };
    }

    const controller = pawn.getController();
    const playerStart = controller && this.gameMode
      ? this.gameMode.findPlayerStart(controller as ENGINE.PlayerController)
      : null;
    if (playerStart) {
      const transform = playerStart.getWorldTransform();
      const position = transform.position.clone();
      position.y += PLATFORMER_COLLIDER_HALF_HEIGHT; // PlayerStart marks the floor, pawn origin is the capsule center.
      return { position, rotation: transform.rotation.clone() };
    }

    return { position: new THREE.Vector3(0, 2, 0), rotation: new THREE.Euler() };
  }
}
