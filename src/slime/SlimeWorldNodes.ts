import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import type { MassRecord } from './MassLedger.js';
import { SlimePawn, visualRadiusForMass } from './SlimePawn.js';
import { getSlimeGameContext } from './SlimeRuntime.js';
import { MASS_VISUAL_ASSETS } from './MassArtDirection.js';

const PIECE_RETURN_SPEED = 5.5;
const PIECE_RETURN_HOP_HEIGHT = 0.28;
const PIECE_RETURN_HOP_RATE = 8;

function makeStoneMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x8f9a81,
    emissive: 0x091611,
    emissiveIntensity: 0.48,
    roughness: 0.88,
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

  public override beginPlay(): boolean {
    if (!super.beginPlay()) return false;
    void ENGINE.resourceManager
      .loadTexture(ENGINE.AssetPath.fromString(MASS_VISUAL_ASSETS.masonryTile))
      .then((sourceTexture) => {
        if (!sourceTexture || !(this.material instanceof THREE.MeshStandardMaterial)) return;
        const texture = sourceTexture.clone();
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(
          Math.max(1, Math.abs(this.scale.x) / 2.2),
          Math.max(1, Math.abs(this.scale.y) / 2.2),
        );
        texture.needsUpdate = true;
        this.material.map = texture;
        this.material.needsUpdate = true;
      });
    return true;
  }
}

@ENGINE.GameClass()
export class SlimeAnchorNode extends ENGINE.MeshNode {
  @ENGINE.property({ type: 'number', category: 'Anchor', min: 2, max: 20, step: 0.25 })
  public activationRadius = 8;

  @ENGINE.property({ type: 'number', category: 'Anchor', min: 0, max: 8, step: 0.05 })
  public preferredTetherLength = 0;

  @ENGINE.property({ type: 'boolean', category: 'Anchor' })
  public startsDormant = false;

  private highlighted = false;
  private valid = false;
  private elapsed = 0;
  private dormant = false;
  private readonly restingScale = new THREE.Vector3(1, 1, 1);
  private bushVisual: ENGINE.MeshNode | null = null;

  constructor() {
    super();
  }

  public override initialize(options?: ENGINE.MeshNodeOptions): void {
    super.initialize({
      geometry: new THREE.SphereGeometry(0.34, 16, 12),
      material: new THREE.MeshStandardMaterial({
        color: 0x79ec86,
        emissive: 0x1d5525,
        roughness: 0.58,
      }),
      castShadow: true,
      physicsOptions: { enabled: false },
      ...options,
    });
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) return false;
    this.restingScale.copy(this.scale);
    this.dormant = this.startsDormant;
    this.bushVisual = this.createBushVisual();
    this.bushVisual.isRoot = true;
    this.getWorld()?.add(this.bushVisual);
    void ENGINE.resourceManager
      .loadTexture(ENGINE.AssetPath.fromString(MASS_VISUAL_ASSETS.growthBush))
      .then((texture) => {
        const bushMaterial = this.bushVisual?.material;
        if (!texture || !(bushMaterial instanceof THREE.MeshBasicMaterial)) return;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.needsUpdate = true;
        bushMaterial.map = texture;
        bushMaterial.needsUpdate = true;
      });
    this.applyAppearance();
    getSlimeGameContext(this.getWorld())?.registerAnchor(this);
    return true;
  }

  public override endPlay(): boolean {
    getSlimeGameContext(this.getWorld())?.unregisterAnchor(this);
    this.bushVisual?.destroy();
    this.bushVisual = null;
    return super.endPlay();
  }

  public setHighlighted(highlighted: boolean, valid: boolean): void {
    if (this.highlighted === highlighted && this.valid === valid) return;
    this.highlighted = highlighted;
    this.valid = valid;
    this.applyAppearance();
  }

  public isAvailable(): boolean {
    return !this.dormant;
  }

  public awaken(): void {
    if (!this.dormant) return;
    this.dormant = false;
    this.applyAppearance();
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.elapsed += deltaTime;
    const pulse = Math.sin(this.elapsed * (this.highlighted ? 6.5 : 2.4) + this.position.x * 0.31);
    const scale = 1 + pulse * (this.highlighted ? 0.1 : 0.045);
    this.scale.copy(this.restingScale).multiplyScalar(scale);
    if (this.bushVisual) {
      this.bushVisual.position.copy(this.getWorldPosition());
      this.bushVisual.position.y -= 0.24;
      this.bushVisual.position.z = -1.62;
      this.bushVisual.scale.set(3.15 * scale, 1.58 * scale, 1);
    }
    const material = this.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      const baseIntensity = this.dormant ? 1.65 : 1.15;
      material.emissiveIntensity = this.highlighted ? 2.2 + pulse * 0.45 : baseIntensity + pulse * 0.18;
    }
  }

  private applyAppearance(): void {
    const material = this.material;
    if (!(material instanceof THREE.MeshStandardMaterial)) return;
    const bushMaterial = this.bushVisual?.material;
    if (this.dormant) {
      material.color.setHex(this.highlighted ? 0xff5a62 : 0xb92f3c);
      material.emissive.setHex(this.highlighted ? 0x851720 : 0x4c0b12);
      if (bushMaterial instanceof THREE.MeshBasicMaterial) {
        bushMaterial.color.setHex(this.highlighted ? 0xff7779 : 0xc94d55);
        bushMaterial.opacity = this.highlighted ? 1 : 0.82;
      }
      return;
    }
    material.color.setHex(this.highlighted ? (this.valid ? 0xb7ff8d : 0xff4b53) : 0x79ec86);
    material.emissive.setHex(this.highlighted ? (this.valid ? 0x428c2d : 0x75131b) : 0x1d5525);
    if (bushMaterial instanceof THREE.MeshBasicMaterial) {
      bushMaterial.color.setHex(this.highlighted
        ? (this.valid ? 0xc8ff9d : 0xff6a70)
        : 0x7fcf78);
      bushMaterial.opacity = this.highlighted ? 1 : 0.9;
    }
  }

  private createBushVisual(): ENGINE.MeshNode {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.94,
      alphaTest: 0.015,
      depthWrite: false,
      depthTest: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    const position = this.getWorldPosition();
    position.y -= 0.24;
    position.z = -1.62;
    const bush = ENGINE.MeshNode.create({
      name: `${this.name} Bush`,
      geometry: new THREE.PlaneGeometry(1, 1),
      material,
      position,
      scale: new THREE.Vector3(3.15, 1.58, 1),
      castShadow: false,
      receiveShadow: false,
      physicsOptions: { enabled: false },
    });
    bush.renderOrder = 95;
    bush.frustumCulled = false;
    return bush;
  }
}

export abstract class SlimeTriggerActor extends ENGINE.SceneNode {
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
      const time = this.getWorld()?.getGameTime() ?? 0;
      this.visual.rotation.y += deltaTime * 1.8;
      this.visual.rotation.z = Math.sin(time * 1.3) * 0.14;
      this.visual.position.y = 0.12 + Math.sin(time) * 0.08;
      const pulse = 1 + Math.sin(time * 3.1) * 0.055;
      this.visual.scale.set(pulse, pulse, pulse);
      const material = this.visual.material;
      if (material instanceof THREE.MeshPhysicalMaterial) {
        material.emissiveIntensity = 1.2 + Math.sin(time * 3.1) * 0.28;
      }
    }
  }

  protected override onPlayerEntered(_player: SlimePawn): void {
    this.consumed = true;
    getSlimeGameContext(this.getWorld())?.consumeBiomass(this.massValue, this.getWorldPosition());
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
  private elapsed = 0;

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

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.elapsed += deltaTime;
    if (!this.visual) return;
    const pulse = Math.sin(this.elapsed * (this.consumed ? 2.4 : 5.2));
    const scale = 1 + pulse * (this.consumed ? 0.025 : 0.065);
    this.visual.scale.set(scale, 1 + pulse * 0.04, scale);
    const material = this.visual.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.emissiveIntensity = this.consumed ? 1.4 : 1.15 + pulse * 0.3;
    }
  }

  protected override onPlayerEntered(_player: SlimePawn): void {
    this.consumed = true;
    const material = this.visual?.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.color.setHex(0x6fff8c);
      material.emissive.setHex(0x165625);
    }
    getSlimeGameContext(this.getWorld())?.activateGateSwitch(this.getWorldPosition());
  }
}

@ENGINE.GameClass()
export class MomentumSwitchNode extends SlimeTriggerActor {
  @ENGINE.property({ type: 'number', category: 'Momentum Switch', min: 20, max: 300, step: 5 })
  public minimumMass = 120;

  @ENGINE.property({ type: 'number', category: 'Momentum Switch', min: 1, max: 30, step: 0.5 })
  public minimumImpactSpeed = 9;

  @ENGINE.property({ type: 'number', category: 'Momentum Switch', min: 100, max: 5000, step: 50 })
  public requiredMomentum = 1200;

  @ENGINE.property({ type: 'number', category: 'Momentum Switch', min: -1, max: 1, step: 2 })
  public impactDirectionX = 1;

  private elapsed = 0;
  private failurePulse = 0;

  public override initialize(options?: ENGINE.SceneNodeOptions): void {
    super.initialize(options);
    const visual = ENGINE.MeshNode.create({
      name: 'MomentumSwitchVisual',
      geometry: new THREE.BoxGeometry(0.34, 1.45, 0.82),
      material: new THREE.MeshStandardMaterial({
        color: 0xb73943,
        emissive: 0x4b0c12,
        emissiveIntensity: 1.4,
        roughness: 0.4,
        metalness: 0.18,
      }),
      physicsOptions: { enabled: false },
    });
    this.addVisualAndTrigger(visual, new THREE.Vector3(0.8, 1.35, 1.2));
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.elapsed += deltaTime;
    this.failurePulse = Math.max(0, this.failurePulse - deltaTime * 2.8);
    if (!this.visual) return;
    const pulse = Math.sin(this.elapsed * (this.consumed ? 3 : 6));
    const impactFlash = this.failurePulse * 0.22;
    this.visual.scale.set(
      1 + impactFlash,
      1 + pulse * (this.consumed ? 0.025 : 0.055) + impactFlash,
      1 + impactFlash,
    );
    const material = this.visual.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.emissiveIntensity = (this.consumed ? 2.2 : 1.45) + pulse * 0.25 + this.failurePulse;
    }
  }

  protected override onPlayerEntered(player: SlimePawn): void {
    const mass = player.getControlledMass();
    const impactSpeed = Math.max(0, player.getVelocity().x * Math.sign(this.impactDirectionX || 1));
    const momentum = mass * impactSpeed;
    const context = getSlimeGameContext(this.getWorld());
    if (mass < this.minimumMass) {
      this.failurePulse = 1;
      context?.reportMomentumFailure(`Need ${Math.round(this.minimumMass)} controlled mass.`);
      return;
    }
    if (impactSpeed < this.minimumImpactSpeed || momentum < this.requiredMomentum) {
      this.failurePulse = 1;
      context?.reportMomentumFailure('Not enough impact. Orbit longer, then strike the wall fast.');
      return;
    }

    this.consumed = true;
    const material = this.visual?.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.color.setHex(0x76ed82);
      material.emissive.setHex(0x1c6428);
    }
    context?.activateMomentumSwitch(this.getWorldPosition());
  }
}

@ENGINE.GameClass()
export class PrototypeExitNode extends SlimeTriggerActor {
  @ENGINE.property({ type: 'number', category: 'Exit', min: 1, max: 500, step: 1 })
  public requiredMass = 130;

  @ENGINE.property({ type: 'boolean', category: 'Exit' })
  public completesGame = false;
  private elapsed = 0;

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

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.elapsed += deltaTime;
    if (!this.visual) return;
    const pulse = Math.sin(this.elapsed * (this.consumed ? 5.4 : 2.6));
    const scale = (this.consumed ? 1.16 : 1) + pulse * (this.consumed ? 0.1 : 0.055);
    this.visual.scale.setScalar(scale);
    this.visual.rotation.y = this.consumed
      ? this.elapsed * 1.8
      : Math.sin(this.elapsed * 0.9) * 0.16;
    const material = this.visual.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.emissiveIntensity = (this.consumed ? 3 : 1.35) + pulse * (this.consumed ? 0.7 : 0.3);
    }
  }

  protected override onPlayerEntered(_player: SlimePawn): void {
    if (getSlimeGameContext(this.getWorld())?.tryComplete(
      this.requiredMass,
      this.getWorldPosition(),
      this.completesGame,
    )) {
      this.consumed = true;
      const material = this.visual?.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.setHex(0x75ffd3);
        material.emissive.setHex(0x1f8067);
      }
    }
  }
}

@ENGINE.GameClass()
export class VerticalCheckpointNode extends SlimeTriggerActor {
  @ENGINE.property({ type: 'number', category: 'Checkpoint', min: 1, max: 10, step: 1 })
  public checkpointIndex = 1;

  private elapsed = 0;

  public override initialize(options?: ENGINE.SceneNodeOptions): void {
    super.initialize(options);
    const visual = ENGINE.MeshNode.create({
      name: 'CheckpointBloom',
      geometry: new THREE.TorusGeometry(0.34, 0.1, 10, 24),
      material: new THREE.MeshStandardMaterial({
        color: 0xb9ff8d,
        emissive: 0x2f6e29,
        emissiveIntensity: 1.7,
        roughness: 0.38,
      }),
      physicsOptions: { enabled: false },
    });
    this.addVisualAndTrigger(visual, new THREE.Vector3(1.15, 0.9, 1.2));
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.elapsed += deltaTime;
    if (!this.visual) return;
    const pulse = 1 + Math.sin(this.elapsed * (this.consumed ? 3.5 : 5.5)) * 0.08;
    this.visual.scale.setScalar((this.consumed ? 1.15 : 1) * pulse);
    this.visual.rotation.z += deltaTime * (this.consumed ? 0.45 : 0.9);
    const material = this.visual.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.emissiveIntensity = (this.consumed ? 2.4 : 1.7) + (pulse - 1) * 2;
    }
  }

  protected override onPlayerEntered(_player: SlimePawn): void {
    this.consumed = true;
    const respawnPosition = this.getWorldPosition().clone().add(new THREE.Vector3(0, 0.85, 0));
    getSlimeGameContext(this.getWorld())?.activateVerticalCheckpoint(this.checkpointIndex, respawnPosition);
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
      const material = this.visual.material;
      if (material instanceof THREE.MeshPhysicalMaterial) {
        material.emissive.setHex(this.awakened ? 0x1b7b68 : 0x092f27);
        material.emissiveIntensity = this.awakened ? 1.8 + Math.sin(this.elapsed * 12) * 0.35 : 1;
      }
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
