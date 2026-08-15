import type * as ENGINE from '@gnsx/genesys.js';
import type * as THREE from 'three';

import type { MassRecord, MassSnapshot } from './MassLedger.js';
import type { SlimePawn } from './SlimePawn.js';
import type {
  SlimeAnchorNode,
  SlimeMassGateNode,
  SlimePieceNode,
} from './SlimeWorldNodes.js';

export type PrototypePhase = 'stretch' | 'feed' | 'split' | 'sense' | 'escape' | 'complete';

export interface SlimeGameContext {
  getPawn(): SlimePawn | null;
  getMassSnapshot(): MassSnapshot;
  getControlledRecord(): MassRecord | null;
  registerPawn(pawn: SlimePawn): void;
  registerAnchor(anchor: SlimeAnchorNode): void;
  unregisterAnchor(anchor: SlimeAnchorNode): void;
  registerGate(gate: SlimeMassGateNode): void;
  unregisterGate(gate: SlimeMassGateNode): void;
  registerPiece(piece: SlimePieceNode): void;
  unregisterPiece(piece: SlimePieceNode): void;
  findAnchorForAim(aimPoint: THREE.Vector3, origin: THREE.Vector3, range: number): SlimeAnchorNode | null;
  updateAnchorHighlights(aimPoint: THREE.Vector3, origin: THREE.Vector3, range: number): SlimeAnchorNode | null;
  splitControlled(amount: number, position: THREE.Vector3, directionX: number): SlimePieceNode | null;
  consumeBiomass(amount: number): void;
  senseNextPiece(): SlimePieceNode | null;
  reunitePiece(piece: SlimePieceNode): void;
  activateGateSwitch(): void;
  canPiecesFollow(): boolean;
  tryComplete(requiredMass: number): boolean;
  setPhase(phase: PrototypePhase): void;
  restartPrototype(): void;
  updateSplitCharge(amount: number, maximum: number, visible: boolean): void;
}

const contexts = new WeakMap<ENGINE.World, SlimeGameContext>();

export function setSlimeGameContext(world: ENGINE.World, context: SlimeGameContext | null): void {
  if (context) contexts.set(world, context);
  else contexts.delete(world);
}

export function getSlimeGameContext(world: ENGINE.World | null | undefined): SlimeGameContext | null {
  return world ? contexts.get(world) ?? null : null;
}
