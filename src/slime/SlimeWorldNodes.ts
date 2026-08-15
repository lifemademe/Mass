import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import type { MassRecord } from './MassLedger.js';
import { SlimePawn, visualRadiusForMass } from './SlimePawn.js';
import { getSlimeGameContext } from './SlimeRuntime.js';

const PIECE_RETURN_SPEED = 5.5;
const PIECE_RETURN_HOP_HEIGHT = 0.28;
const PIECE_RETURN_HOP_RATE = 8;

function makeStoneMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x26392f,
    roughness: 0.92,
    metalness: 0,
  });
}

@ENGINE.GameClass()
export class SlimePrototypeSpawnNode extends ENGINE.SceneNode {
  public override getEditorClassIcon(): string | null {
    return 'Icon_PlayerStart';
  }
}

@ENGINE.GameClass()
export class PrototypeBlockNode extends ENGINE.MeshNode {
  constructor() {
    super();
  }

  public override initialize(options?: ENGINE.MeshNodeOptions): void {
    super.initialize({
      geometry: new THREE.BoxGeometry(1, 1, 1),
      material: makeStoneMaterial(),
      castShadow: true,
      receiveShadow: true,
      physicsOptions: {
        enabled: true,
        motionType: ENGINE.PhysicsMotionType.Static,
        collisionProfile: ENGINE.DefaultCollisionProfile.BlockAll,
      },
      ...options,
    });
  }
}

@ENGINE.GameClass()
export class SlimeAnchorNode extends ENGINE.MeshNode {
  @ENGINE.property({ type: 'number', category: 'Anchor', min: 2, max: 20, step: 0.25 })
  public activationRadius = 8;

  @ENGINE.property({ type: 'number', category: 'Anchor', min: 0, max: 8, step: 0.05 })
  public preferredTetherLength = 0;

  private highlighted = false;
  private valid = false;

  constructor() {
    super();
  }

  public override initialize(options?: ENGINE.MeshNodeOptions): void {
    super.initialize({
      geometry: new THREE.SphereGeometry(0.34, 16, 12),
      material: new THREE.MeshStandardMaterial({
        color: 0x78c86e,
        emissive: 0x132f17,
        roughness: 0.72,
      }),
      castShadow: true,
      physicsOptions: { enabled: false },
      ...options,
    });
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) return false;
    getSlimeGameContext(this.getWorld())?.registerAnchor(this);
    return true;
  }

  public override endPlay(): boolean {
    getSlimeGameContext(this.getWorld())?.unregisterAnchor(this);
    return super.endPlay();
  }

  public setHighlighted(highlighted: boolean, valid: boolean): void {
    if (this.highlighted === highlighted && this.valid === valid) return;
    this.highlighted = highlighted;
    this.valid = valid;
    const material = this.material;
    if (!(material instanceof THREE.MeshStandardMaterial)) return;
    material.color.setHex(highlighted ? (valid ? 0x9dff7a : 0xff4b53) : 0x78c86e);
    material.emissive.setHex(highlighted ? (valid ? 0x337520 : 0x75131b) : 0x132f17);
  }
}

abstract class SlimeTriggerActor extends ENGINE.SceneNode {
  protected visual: ENGINE.MeshNode | null = null;
  protected trigger: ENGINE.TriggerZoneNode | null = null;
  protected consumed = false;

  protected readonly onEntered = (node: ENGINE.SceneNode): void => {
    if (!this.consumed && node instanceof SlimePawn) this.onPlayerEntered(node);
  };

  constructor() {
    super();
  }

  public override beginPlay(): boolean {
    this.visual = this.getNodes(ENGINE.MeshNode).find((node) => !(node instanceof ENGINE.TriggerZoneNode)) ?? this.visual;
    this.trigger = this.getNode(ENGINE.TriggerZoneNode) ?? this.trigger;
    if (!super.beginPlay()) return false;
    this.trigger?.onActorEntered.add(this.onEntered);
    return true;
  }

  public override endPlay(): boolean {
    this.trigger?.onActorEntered.remove(this.onEntered);
    return super.endPlay();
  }

  protected addVisualAndTrigger(
    visual: ENGINE.MeshNode,
    triggerScale = new THREE.Vector3(1, 1, 1),
  ): void {
    this.visual = visual;
    this.trigger = ENGINE.TriggerZoneNode.create({
      name: 'Trigger',
      geometry: new THREE.SphereGeometry(1, 12, 8),
      scale: triggerScale,
      filter: ENGINE.TriggerFilter.PlayerOnly,
      physicsOptions: {
        enabled: true,
        motionType: ENGINE.PhysicsMotionType.Static,
        generateCollisionEvents: true,
        collisionProfile: ENGINE.DefaultCollisionProfile.Trigger,
      },
    });
    this.add(this.visual, this.trigger);
  }

  protected abstract onPlayerEntered(player: SlimePawn): void;
}

@ENGINE.GameClass()
export class BiomassPickupNode extends SlimeTriggerActor {
  @ENGINE.property({ type: 'number', category: 'Biomass', min: 1, max: 200, step: 1 })
  public massValue = 40;

  public override initialize(options?: ENGINE.SceneNodeOptions): void {
    super.initialize(options);
    const visual = ENGINE.MeshNode.create({
      name: 'BiomassVisual',
      geometry: new THREE.IcosahedronGeometry(0.42, 2),
      material: new THREE.MeshPhysicalMaterial({
        color: 0xffbd48,
        emissive: 0x613300,
        transmission: 0.18,
        roughness: 0.38,
      }),
      castShadow: true,
      physicsOptions: { enabled: false },
    });
    this.addVisualAndTrigger(visual, new THREE.Vector3(0.8, 0.8, 0.8));
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    if (this.visual) {
      this.visual.rotation.y += deltaTime * 1.8;
      this.visual.position.y = 0.12 + Math.sin(this.getWorld()?.getGameTime() ?? 0) * 0.08;
    }
  }

  protected override onPlayerEntered(_player: SlimePawn): void {
    this.consumed = true;
    getSlimeGameContext(this.getWorld())?.consumeBiomass(this.massValue);
    this.destroy();
  }
}

@ENGINE.GameClass()
export class SlimeMassGateNode extends ENGINE.MeshNode {
  @ENGINE.property({ type: 'number', category: 'Gate', min: 1, max: 12, step: 0.25 })
  public openHeight = 5;

  @ENGINE.property({ type: 'number', category: 'Gate', min: 0.25, max: 8, step: 0.25 })
  public openSpeed = 3;

  private closedY = 0;
  private opening = false;

  constructor() {
    super();
  }

  public override initialize(options?: ENGINE.MeshNodeOptions): void {
    super.initialize({
      geometry: new THREE.BoxGeometry(1, 1, 1),
      material: new THREE.MeshStandardMaterial({ color: 0x516760, metalness: 0.55, roughness: 0.38 }),
      castShadow: true,
      receiveShadow: true,
      physicsOptions: {
        enabled: true,
        motionType: ENGINE.PhysicsMotionType.KinematicPositionBased,
        collisionProfile: ENGINE.DefaultCollisionProfile.BlockAll,
      },
      ...options,
    });
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) return false;
    this.closedY = this.position.y;
    getSlimeGameContext(this.getWorld())?.registerGate(this);
    return true;
  }

  public override endPlay(): boolean {
    getSlimeGameContext(this.getWorld())?.unregisterGate(this);
    return super.endPlay();
  }

  public open(): void {
    this.opening = true;
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    if (!this.opening) return;
    this.position.y = Math.min(this.closedY + this.openHeight, this.position.y + this.openSpeed * deltaTime);
  }
}

@ENGINE.GameClass()
export class SlimeSwitchNode extends SlimeTriggerActor {
  public override initialize(options?: ENGINE.SceneNodeOptions): void {
    super.initialize(options);
    const visual = ENGINE.MeshNode.create({
      name: 'SwitchVisual',
      geometry: new THREE.CylinderGeometry(0.42, 0.5, 0.28, 18),
      material: new THREE.MeshStandardMaterial({ color: 0xff6f4c, emissive: 0x4c1008, roughness: 0.5 }),
      physicsOptions: { enabled: false },
    });
    this.addVisualAndTrigger(visual, new THREE.Vector3(0.85, 0.7, 0.85));
  }

  protected override onPlayerEntered(_player: SlimePawn): void {
    this.consumed = true;
    const material = this.visual?.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.color.setHex(0x6fff8c);
      material.emissive.setHex(0x165625);
    }
    getSlimeGameContext(this.getWorld())?.activateGateSwitch();
  }
}

@ENGINE.GameClass()
export class PrototypeExitNode extends SlimeTriggerActor {
  @ENGINE.property({ type: 'number', category: 'Exit', min: 1, max: 500, step: 1 })
  public requiredMass = 130;

  public override initialize(options?: ENGINE.SceneNodeOptions): void {
    super.initialize(options);
    const visual = ENGINE.MeshNode.create({
      name: 'ExitVisual',
      geometry: new THREE.TorusGeometry(0.85, 0.14, 12, 32),
      material: new THREE.MeshStandardMaterial({ color: 0x8f7cff, emissive: 0x251864, roughness: 0.3 }),
      physicsOptions: { enabled: false },
    });
    this.addVisualAndTrigger(visual, new THREE.Vector3(1.2, 1.2, 1.2));
  }

  protected override onPlayerEntered(_player: SlimePawn): void {
    if (getSlimeGameContext(this.getWorld())?.tryComplete(this.requiredMass)) this.consumed = true;
  }
}

@ENGINE.GameClass()
export class SlimePieceNode extends ENGINE.SceneNode {
  private recordId = '';
  private originalMass = 0;
  private consumedMass = 0;
  private visual: ENGINE.MeshNode | null = null;
  private awakened = false;
  private elapsed = 0;
  private hopPhase = 0;
  private readonly returnPosition = new THREE.Vector3();

  constructor() {
    super();
    this.isRoot = true;
  }

  public override initialize(options?: ENGINE.SceneNodeOptions): void {
    super.initialize(options);
    this.visual = ENGINE.MeshNode.create({
      name: 'PieceVisual',
      geometry: new THREE.SphereGeometry(1, 18, 12),
      material: new THREE.MeshPhysicalMaterial({
        color: 0x59ddbc,
        emissive: 0x092f27,
        transparent: true,
        opacity: 0.9,
        transmission: 0.2,
        roughness: 0.3,
      }),
      castShadow: true,
      physicsOptions: { enabled: false },
    });
    this.add(this.visual);
  }

  public configure(record: MassRecord): void {
    this.recordId = record.id;
    this.originalMass = record.originalMass;
    this.consumedMass = record.consumedMass;
    const radius = visualRadiusForMass(this.getMass()) * 0.92;
    this.visual?.scale.set(radius, radius * 0.82, radius * 0.92);
  }

  public override beginPlay(): boolean {
    this.visual = this.getNode(ENGINE.MeshNode) ?? this.visual;
    if (!super.beginPlay()) return false;
    this.returnPosition.copy(this.position);
    this.returnPosition.z = 0;
    getSlimeGameContext(this.getWorld())?.registerPiece(this);
    return true;
  }

  public override endPlay(): boolean {
    getSlimeGameContext(this.getWorld())?.unregisterPiece(this);
    return super.endPlay();
  }

  public getRecordId(): string {
    return this.recordId;
  }

  public getMass(): number {
    return this.originalMass + this.consumedMass;
  }

  public awaken(): void {
    if (!this.awakened) {
      this.returnPosition.copy(this.position);
      this.returnPosition.z = 0;
    }
    this.awakened = true;
    this.hopPhase = 0;
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.elapsed += deltaTime;
    const context = getSlimeGameContext(this.getWorld());
    const pawn = context?.getPawn() ?? null;
    const pulse = this.awakened ? 0.11 : 0.035;
    if (this.visual) {
      const radius = visualRadiusForMass(this.getMass()) * 0.92;
      const wobble = 1 + Math.sin(this.elapsed * (this.awakened ? 12 : 4)) * pulse;
      this.visual.scale.set(radius * wobble, radius * 0.82 / wobble, radius * 0.92);
    }
    if (!this.awakened || !context?.canPiecesFollow() || !pawn) return;

    const target = pawn.getWorldPosition();
    target.z = 0;
    const delta = target.clone().sub(this.returnPosition);
    const distance = delta.length();
    const reunionDistance = pawn.getBodyRadius() + visualRadiusForMass(this.getMass()) * 0.92 + 0.2;
    if (distance <= reunionDistance) {
      context.reunitePiece(this);
      return;
    }

    const step = Math.min(PIECE_RETURN_SPEED * deltaTime, distance);
    this.returnPosition.addScaledVector(delta, step / distance);
    this.hopPhase += deltaTime * PIECE_RETURN_HOP_RATE;
    const hop = Math.max(0, Math.sin(this.hopPhase)) * Math.min(PIECE_RETURN_HOP_HEIGHT, distance * 0.12);
    this.position.copy(this.returnPosition);
    this.position.y += hop;
  }
}
