import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { MassLedger, type MassRecord, type MassSnapshot } from './MassLedger.js';
import { OvergrownAtmosphereBuilder } from './OvergrownAtmosphere.js';
import { SlimeFeedbackSystem, type SlimeFeedbackEvent } from './SlimeFeedback.js';
import { SlimePawn } from './SlimePawn.js';
import { SlimePlayerController } from './SlimePlayerController.js';
import { SlimePrototypeHud } from './SlimePrototypeHud.js';
import { setSlimeGameContext, type PrototypePhase, type SlimeGameContext } from './SlimeRuntime.js';
import { VerticalStageBuilder } from './VerticalStageBuilder.js';
import { MassMainMenu } from '../ui/MassMainMenu.js';
import {
  BiomassPickupNode,
  PrototypeBlockNode,
  PrototypeExitNode,
  SlimeAnchorNode,
  SlimeMassGateNode,
  SlimePieceNode,
  SlimePrototypeSpawnNode,
  SlimeSwitchNode,
} from './SlimeWorldNodes.js';

const PHASE_ORDER: Record<PrototypePhase, number> = {
  stretch: 0,
  feed: 1,
  split: 2,
  infiltrate: 3,
  sense: 4,
  return: 5,
  escape: 6,
  vertical: 7,
  verticalUnlocked: 8,
  complete: 9,
};

@ENGINE.GameClass()
export class SlimePrototypeGameMode extends ENGINE.GameMode implements SlimeGameContext {
  private readonly ledger = new MassLedger();
  private readonly feedback = new SlimeFeedbackSystem();
  private readonly anchors = new Set<SlimeAnchorNode>();
  private readonly gates = new Set<SlimeMassGateNode>();
  private readonly pieces = new Set<SlimePieceNode>();
  private pawn: SlimePawn | null = null;
  private hud: SlimePrototypeHud | null = null;
  private mainMenu: MassMainMenu | null = null;
  private phase: PrototypePhase = 'stretch';
  private gatesOpen = false;
  private sensedIndex = -1;
  private gameplayActive = false;
  private stage = 1;
  private stageTransitioning = false;

  private readonly onMassChanged = (snapshot: MassSnapshot): void => {
    this.pawn?.applyMassSnapshot(snapshot);
    this.hud?.updateMass(snapshot);
  };

  public override getPlayerControllerFactory(): () => Promise<ENGINE.PlayerController> {
    return async () => SlimePlayerController.create({ noPointerLock: true });
  }

  public override getPawnFactory(): () => Promise<ENGINE.Pawn> {
    return async () => SlimePawn.create({ name: 'Mass' });
  }

  public override async spawnPlayerPawnWithTransform(
    clientId: ENGINE.ClientId,
    playerController: ENGINE.PlayerController,
    spawnPosition: THREE.Vector3,
    spawnRotation: THREE.Euler,
  ): Promise<ENGINE.Pawn | null> {
    const world = this.getWorld();
    const hasPlayerStart = world?.getNodes(ENGINE.PlayerStart).length !== 0;
    const prototypeStart = world?.getNodes(SlimePrototypeSpawnNode)[0] ?? null;
    const lifted = hasPlayerStart
      ? spawnPosition.clone()
      : prototypeStart?.getWorldPosition().clone() ?? new THREE.Vector3(-8, 0, 0);
    lifted.y += 0.5;
    lifted.z = 0;
    return super.spawnPlayerPawnWithTransform(clientId, playerController, lifted, spawnRotation);
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) return false;
    const world = this.getWorld();
    if (!world) return false;
    setSlimeGameContext(world, this);
    this.feedback.bind(world);
    this.buildPrototypeRoom(world);
    this.ledger.onMassChanged.add(this.onMassChanged);
    this.hud = new SlimePrototypeHud(world);
    this.mainMenu = new MassMainMenu(world.uiManager, {
      onPlay: () => this.startGame(),
      onQuit: () => this.quitToEditor(),
    });
    void Promise.all([this.hud.initialize(), this.mainMenu.initialize()]).then(() => {
      this.hud?.updateMass(this.ledger.snapshot());
      this.hud?.updatePhase(this.phase);
      this.hud?.setGameplayVisible(false);
      this.mainMenu?.showMainMenu();
    });
    this.setPhase('stretch');
    return true;
  }

  public override endPlay(): boolean {
    const world = this.getWorld();
    if (world) setSlimeGameContext(world, null);
    this.ledger.onMassChanged.remove(this.onMassChanged);
    this.feedback.unbind();
    this.hud?.destroy();
    this.mainMenu?.destroy();
    this.hud = null;
    this.mainMenu = null;
    this.anchors.clear();
    this.gates.clear();
    this.pieces.clear();
    this.pawn = null;
    this.gameplayActive = false;
    return super.endPlay();
  }

  public getPawn(): SlimePawn | null { return this.pawn; }
  public getMassSnapshot(): MassSnapshot { return this.ledger.snapshot(); }
  public getControlledRecord(): MassRecord | null { return this.ledger.getControlled(); }
  public isGameplayActive(): boolean { return this.gameplayActive; }

  public registerPawn(pawn: SlimePawn): void {
    this.pawn = pawn;
    this.ledger.reset(pawn.getMassSettings().initialOriginalMass, pawn);
  }

  public registerAnchor(anchor: SlimeAnchorNode): void { this.anchors.add(anchor); }
  public unregisterAnchor(anchor: SlimeAnchorNode): void { this.anchors.delete(anchor); }
  public registerGate(gate: SlimeMassGateNode): void {
    this.gates.add(gate);
    if (this.gatesOpen) gate.open();
  }
  public unregisterGate(gate: SlimeMassGateNode): void { this.gates.delete(gate); }
  public registerPiece(piece: SlimePieceNode): void { this.pieces.add(piece); }
  public unregisterPiece(piece: SlimePieceNode): void { this.pieces.delete(piece); }

  public findAnchorForAim(aimPoint: THREE.Vector3, origin: THREE.Vector3, range: number): SlimeAnchorNode | null {
    const aimed = this.pickAnchor(aimPoint, origin, range, false);
    if (aimed && !aimed.isAvailable()) {
      this.hud?.showMomentumFailure('This growth is dormant. Strike the wall switch first.');
    }
    return this.pickAnchor(aimPoint, origin, range, true);
  }

  public updateAnchorHighlights(aimPoint: THREE.Vector3, origin: THREE.Vector3, range: number): SlimeAnchorNode | null {
    const candidate = this.pickAnchor(aimPoint, origin, range, false);
    for (const anchor of this.anchors) {
      const selected = anchor === candidate;
      const valid = anchor.isAvailable()
        && origin.distanceTo(anchor.getWorldPosition()) <= Math.min(range, anchor.activationRadius);
      anchor.setHighlighted(selected, valid);
    }
    return candidate;
  }

  public splitControlled(amount: number, position: THREE.Vector3, directionX: number): SlimePieceNode | null {
    const controlled = this.ledger.getControlled();
    const pawn = this.pawn;
    if (!controlled || !pawn) return null;
    const settings = pawn.getMassSettings();
    const current = controlled.originalMass + controlled.consumedMass;
    const safeAmount = Math.min(amount, current - settings.minimumControlledMass);
    if (safeAmount < settings.minimumPieceMass || this.pieces.size >= settings.maximumDetachedPieces) return null;

    const record = this.ledger.split(controlled.id, safeAmount);
    if (!record) return null;
    const piece = SlimePieceNode.create({ name: `Separated ${Math.round(safeAmount)}` });
    piece.configure(record);
    piece.position.copy(position);
    piece.position.x -= directionX * (pawn.getBodyRadius() + 0.55);
    piece.position.y = Math.max(0.34, piece.position.y);
    piece.position.z = 0;
    this.getWorld()?.add(piece);
    this.ledger.setNode(record.id, piece);
    this.playFeedback('split', piece.getWorldPosition());
    pawn.addCameraImpulse(0.14);
    if (this.phase === 'split' && this.ledger.snapshot().controlledMass <= 60) {
      this.setPhase('infiltrate');
    }
    return piece;
  }

  public consumeBiomass(amount: number, position: THREE.Vector3): void {
    const controlled = this.ledger.getControlled();
    if (controlled && this.ledger.consume(controlled.id, amount)) {
      this.playFeedback('biomass', position);
      this.setPhase('split');
    }
  }

  public senseNextPiece(): SlimePieceNode | null {
    if (!this.gatesOpen) return null;
    const candidates = [...this.pieces].filter((piece) => piece.getRecordId().length > 0);
    if (candidates.length === 0) return null;
    const origin = this.pawn?.getWorldPosition() ?? new THREE.Vector3();
    candidates.sort((a, b) => a.getWorldPosition().distanceToSquared(origin) - b.getWorldPosition().distanceToSquared(origin));
    this.sensedIndex = (this.sensedIndex + 1) % candidates.length;
    const piece = candidates[this.sensedIndex];
    piece.awaken();
    this.playFeedback('sense', piece.getWorldPosition());
    this.setPhase('return');
    return piece;
  }

  public reunitePiece(piece: SlimePieceNode): void {
    const controlled = this.ledger.getControlled();
    if (!controlled || !this.ledger.reunite(controlled.id, piece.getRecordId())) return;
    this.playFeedback('reunion', piece.getWorldPosition());
    this.pawn?.addCameraImpulse(0.22);
    piece.destroy();
    if (this.ledger.getDetached().length === 0) {
      this.hud?.showReunionMilestone();
      this.setPhase('escape');
    }
  }

  public activateGateSwitch(position: THREE.Vector3): void {
    this.gatesOpen = true;
    for (const gate of this.gates) gate.open();
    this.playFeedback('switch', position);
    this.setPhase('sense');
  }

  public activateMomentumSwitch(position: THREE.Vector3): void {
    let awakened = 0;
    for (const anchor of this.anchors) {
      if (!anchor.isAvailable()) {
        anchor.awaken();
        awakened += 1;
      }
    }
    if (awakened === 0) return;
    this.playFeedback('switch', position);
    this.pawn?.addCameraImpulse(0.28);
    this.setPhase('verticalUnlocked');
    this.hud?.showGrowthsAwakened();
  }

  public reportMomentumFailure(message: string): void {
    this.hud?.showMomentumFailure(message);
  }

  public canPiecesFollow(): boolean { return this.gatesOpen; }

  public tryComplete(requiredMass: number, position: THREE.Vector3, completesGame: boolean): boolean {
    if (!this.gameplayActive || this.phase === 'complete' || this.stageTransitioning) return false;
    if (this.ledger.snapshot().controlledMass < requiredMass) return false;
    if (this.stage === 1 && !completesGame) {
      this.beginVerticalStage(position);
      return true;
    }
    if (this.stage !== 2 || !completesGame) return false;
    this.playFeedback('complete', position);
    this.pawn?.addCameraImpulse(0.34);
    this.setPhase('complete');
    return true;
  }

  public playFeedback(event: SlimeFeedbackEvent, position: THREE.Vector3): void {
    this.feedback.emit(event, position);
  }

  public setPhase(phase: PrototypePhase): void {
    if (PHASE_ORDER[phase] < PHASE_ORDER[this.phase]) return;
    this.phase = phase;
    this.hud?.updatePhase(phase);
  }

  public restartPrototype(): void {
    const world = this.getWorld();
    const gameLoop = world?.gameLoop;
    if (!world || !gameLoop) return;
    const activeScene = gameLoop.activeScenePath?.asStringPath;
    if (world.netWorld.isPlaying()) world.netWorld.endPlay();
    else if (world.isPlayEnded()) world.resetPlayStateForWorldTransition();
    if (activeScene) void gameLoop.openLevel(activeScene, { preserveRoots: false });
    else void gameLoop.reloadInitialLevel({ preserveRoots: false });
  }

  public updateSplitCharge(amount: number, maximum: number, visible: boolean): void {
    this.hud?.updateCharge(amount, maximum, visible);
  }

  private pickAnchor(aimPoint: THREE.Vector3, origin: THREE.Vector3, range: number, requireValid: boolean): SlimeAnchorNode | null {
    let best: SlimeAnchorNode | null = null;
    let bestAimDistance = this.pawn?.getAnchorAimTolerance() ?? 1.5;
    for (const anchor of this.anchors) {
      const anchorPosition = anchor.getWorldPosition();
      const valid = anchor.isAvailable()
        && origin.distanceTo(anchorPosition) <= Math.min(range, anchor.activationRadius);
      if (requireValid && !valid) continue;
      const aimDistance = aimPoint.distanceTo(anchorPosition);
      if (aimDistance < bestAimDistance) {
        best = anchor;
        bestAimDistance = aimDistance;
      }
    }
    return best;
  }

  private buildPrototypeRoom(world: ENGINE.World): void {
    const addRoot = <T extends ENGINE.SceneNode>(node: T): T => {
      node.isRoot = true;
      world.add(node);
      return node;
    };
    for (const atmosphereNode of new OvergrownAtmosphereBuilder().build()) addRoot(atmosphereNode);
    if (world.getNodes(SlimeAnchorNode).length > 0) return;

    const block = (name: string, x: number, y: number, width: number, height: number, depth = 3): void => {
      addRoot(PrototypeBlockNode.create({
        name,
        position: new THREE.Vector3(x, y, 0),
        scale: new THREE.Vector3(width, height, depth),
      }));
    };

    addRoot(SlimePrototypeSpawnNode.create({ name: 'Player Start', position: new THREE.Vector3(-8, 0, 0) }));

    block('Start Chamber Floor', -6, -0.5, 10, 1);
    block('Biomass Chamber Floor', 5, -0.5, 6, 1);
    block('Grate Approach Floor', 11, -0.5, 6, 1);
    block('Reunion Hall Floor', 20, -0.5, 12, 1);
    block('Exit Ledge', 29, 5.5, 6, 1);
    block('Start Back Wall', -11.5, 4, 1, 9);
    block('Grate Header', 14, 5.25, 2, 3);

    addRoot(SlimeAnchorNode.create({ name: 'Pit Growth', position: new THREE.Vector3(0.5, 4.5, 0) }));
    const finalAnchor = SlimeAnchorNode.create({ name: 'Final High Growth', position: new THREE.Vector3(25, 8, 0) });
    finalAnchor.activationRadius = 10;
    finalAnchor.preferredTetherLength = 1.5;
    addRoot(finalAnchor);

    addRoot(BiomassPickupNode.create({ name: 'Biomass +40', position: new THREE.Vector3(4.6, 0.7, 0) }));
    const gate = SlimeMassGateNode.create({
      name: 'Small Mass Grate',
      position: new THREE.Vector3(14, 2.25, 0),
      scale: new THREE.Vector3(0.8, 3, 3),
    });
    gate.openHeight = 5;
    addRoot(gate);
    addRoot(SlimeSwitchNode.create({ name: 'Grate Switch', position: new THREE.Vector3(17, 0.22, 0) }));
    const exit = PrototypeExitNode.create({ name: 'Mass Exit 130', position: new THREE.Vector3(29, 6.8, 0) });
    exit.requiredMass = 130;
    addRoot(exit);

  }

  private startGame(): void {
    if (this.gameplayActive) return;
    this.gameplayActive = true;
    this.mainMenu?.hide();
    this.hud?.setGameplayVisible(true);
    this.hud?.updateMass(this.ledger.snapshot());
    this.hud?.updatePhase(this.phase);
  }

  private quitToEditor(): void {
    const world = this.getWorld();
    if (world?.netWorld.isPlaying()) world.netWorld.endPlay();
  }

  private beginVerticalStage(exitPosition: THREE.Vector3): void {
    const world = this.getWorld();
    const pawn = this.pawn;
    if (!world || !pawn) return;
    this.stageTransitioning = true;
    this.playFeedback('stage', exitPosition);
    pawn.addCameraImpulse(0.25);

    const stage = new VerticalStageBuilder();
    for (const node of stage.build()) {
      node.isRoot = true;
      world.add(node);
    }
    this.stage = 2;
    this.phase = 'vertical';
    pawn.prepareVerticalStage();
    pawn.teleportTo(stage.spawnPosition);
    this.hud?.updatePhase('vertical');
    this.hud?.showStageIntro();
    this.stageTransitioning = false;
  }
}
