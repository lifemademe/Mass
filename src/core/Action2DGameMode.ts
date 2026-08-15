/**
 * Action2DGameMode - rules for the 2D action sample level.
 *
 * Thin wiring layer: owns the shared `GameState`, the HUD, and the feel/audio binders, and
 * delegates player spawning, checkpoint respawn, and level restart to `LevelFlowController`.
 */
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import type { PlatformerPawn } from '../player/PlatformerPawn.js';
import { PlatformerPlayerController } from '../player/PlatformerPlayerController.js';
import { Hud2D } from '../ui/Hud2D.js';

import { Action2DSettingsActor } from '../feel/Action2DSettingsActor.js';
import { CombatFeedbackBinder } from '../feel/CombatFeedbackBinder.js';
import { SoundFeedbackBinder } from '../feel/SoundFeedbackBinder.js';

import { feedback } from './FeedbackEvents.js';
import { GameState } from './GameState.js';
import { LevelFlowController } from './LevelFlowController.js';

@ENGINE.GameClass()
export class Action2DGameMode extends ENGINE.GameMode {
  /** Shared objective/progress state for the level. */
  public readonly gameState = new GameState();

  /** Player spawn / checkpoint respawn / level restart flow. */
  private readonly flow = new LevelFlowController(this.gameState);

  private hud: Hud2D | null = null;
  private readonly combatFeelBinder = new CombatFeedbackBinder();
  private readonly soundBinder = new SoundFeedbackBinder();

  /** Resolve the active `Action2DGameMode` for a world, or null. */
  public static get(world: ENGINE.World | null | undefined): Action2DGameMode | null {
    const gm = world?.gameMode;
    return gm instanceof Action2DGameMode ? gm : null;
  }

  public override getPlayerControllerFactory(): () => Promise<ENGINE.PlayerController> {
    return async () => PlatformerPlayerController.create({ noPointerLock: true });
  }

  public override getPawnFactory(): () => Promise<ENGINE.Pawn> {
    return async () => this.flow.spawnPlayerPawn();
  }

  public override async spawnPlayerPawnWithTransform(
    clientId: ENGINE.ClientId,
    playerController: ENGINE.PlayerController,
    spawnPosition: THREE.Vector3,
    spawnRotation: THREE.Euler,
  ): Promise<ENGINE.Pawn | null> {
    const liftedPosition = this.flow.liftSpawnPosition(spawnPosition);
    return super.spawnPlayerPawnWithTransform(clientId, playerController, liftedPosition, spawnRotation);
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) {
      return false;
    }

    this.gameState.reset();
    this.flow.bind(this.getWorld()!, this);
    feedback.setWorld(this.getWorld());
    const settings = Action2DSettingsActor.get(this.getWorld());
    this.combatFeelBinder.bind(this.getWorld()!, settings?.getCombatFeelSettings());
    this.soundBinder.bind(this.getWorld()!, settings?.getSoundFeedbackSettings());

    this.hud = new Hud2D(this.getWorld()!, this.gameState);
    void this.hud.initialize();

    this.gameState.setPhase('defeatEnemy');
    return true;
  }

  public override endPlay(): boolean {
    if (!super.endPlay()) {
      return false;
    }
    this.combatFeelBinder.unbind();
    this.soundBinder.unbind();
    this.hud?.destroy();
    this.hud = null;
    this.flow.unbind();
    feedback.setWorld(null);
    return true;
  }

  /** Called by the player pawn once it is in the world and ready to be tracked by the HUD. */
  public registerPlayerPawn(pawn: PlatformerPawn): void {
    this.flow.registerPlayerPawn(pawn);
    this.hud?.bindPlayerHealth(pawn.getHealth());
  }

  /** The player pawn currently tracked by the game mode, if spawned. */
  public getPlayerPawn(): PlatformerPawn | null {
    return this.flow.getPlayerPawn();
  }

  /**
   * R input: after level complete, hard-reload the active scene; otherwise checkpoint respawn
   * (alive = force respawn, dead = continue).
   */
  public handleRespawnInput(): void {
    this.flow.handleRespawnInput();
  }

  /** Respawn the currently tracked player pawn (R while alive = force respawn; R while dead = continue). */
  public respawnPlayer(): void {
    this.flow.respawnPlayer();
  }

  /**
   * Hard restart: reload the active scene through the game loop so actors / GameState /
   * one-shots come back from the scene file (same path as a fresh Play).
   */
  public restartLevel(): void {
    this.flow.restartLevel();
  }

  /**
   * Respawn the player at the latest checkpoint (or player start if none), restoring full
   * health, zeroing velocity, and snapping the camera. Defeated enemies stay defeated.
   */
  public respawnAtCheckpoint(pawn: PlatformerPawn): void {
    this.flow.respawnAtCheckpoint(pawn);
  }
}
