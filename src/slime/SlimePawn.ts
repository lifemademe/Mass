import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import type { MassSnapshot } from './MassLedger.js';
import { SlimeCameraNode } from './SlimeCameraNode.js';
import { SlimeTrailNode } from './SlimeJuiceNodes.js';
import { SlimeMovementMode, SlimeMovementSettingsNode } from './SlimeMovement.js';
import { getSlimeGameContext } from './SlimeRuntime.js';

import type { SlimeAnchorNode, SlimePieceNode } from './SlimeWorldNodes.js';

const MOVEMENT_MODE = 'slimeMovement';
const MEDIUM_RADIUS = 0.48;
const RELEASE_FOCUS_TIME_SCALE = 0.75;
const RELEASE_FOCUS_DURATION = 0.35;
const RELEASE_STEERING_LOCK_DURATION = 0.5;

export type SlimeSizeTier = 'small' | 'medium' | 'large';

export function sizeTierForMass(mass: number): SlimeSizeTier {
  if (mass <= 60) return 'small';
  if (mass <= 120) return 'medium';
  return 'large';
}

export function colliderRadiusForMass(mass: number): number {
  const tier = sizeTierForMass(mass);
  if (tier === 'small') return 0.3;
  if (tier === 'large') return 0.68;
  return MEDIUM_RADIUS;
}

export function visualRadiusForMass(mass: number): number {
  return THREE.MathUtils.clamp(0.62 * Math.sqrt(Math.max(mass, 1) / 100), 0.3, 1);
}

@ENGINE.GameClass()
export class SlimeMassNode extends ENGINE.SceneNode {
  @ENGINE.property({ type: 'number', category: 'Mass', min: 20, max: 500, step: 1 })
  public initialOriginalMass = 100;

  @ENGINE.property({ type: 'number', category: 'Mass', min: 1, max: 100, step: 1 })
  public minimumControlledMass = 20;

  @ENGINE.property({ type: 'number', category: 'Mass', min: 1, max: 20, step: 1 })
  public minimumPieceMass = 10;

  @ENGINE.property({ type: 'number', category: 'Mass', min: 1, max: 12, step: 1 })
  public maximumDetachedPieces = 6;

  @ENGINE.property({ type: 'number', category: 'Mass', min: 0.2, max: 3, step: 0.1 })
  public splitChargeDuration = 1.2;
}

@ENGINE.GameClass()
export class SlimePawn extends ENGINE.Pawn {
  private collider!: ENGINE.MeshNode;
  private visual!: ENGINE.MeshNode;
  private faceRoot!: ENGINE.SceneNode;
  private tetherVisual!: ENGINE.MeshNode;
  private stretchShoulder!: ENGINE.MeshNode;
  private stretchTip!: ENGINE.MeshNode;
  private senseVisual!: ENGINE.MeshNode;
  private slimeGlow!: ENGINE.PointLightNode;
  private mover!: ENGINE.MoverNode;
  private cameraNode!: SlimeCameraNode;
  private massSettings!: SlimeMassNode;
  private movementSettings!: SlimeMovementSettingsNode;

  private aimedAnchor: SlimeAnchorNode | null = null;
  private tetherAnchor: SlimeAnchorNode | null = null;
  private tetherLength = 0;
  private tetherRestLength = 0;
  private tetherMovementInputActive = false;
  private tetherIdleElapsed = 0;
  private tetherIdleExtension = 0;
  private senseTarget: SlimePieceNode | null = null;
  private aimPoint = new THREE.Vector3(1, 1, 0);
  private controlledMass = 100;
  private ownedMass = 100;
  private currentTier: SlimeSizeTier = 'medium';
  private splitCharging = false;
  private splitChargeElapsed = 0;
  private senseVisualRemaining = 0;
  private elapsed = 0;
  private wasGrounded = false;
  private lastVerticalSpeed = 0;
  private trailElapsed = 0;
  private readonly lastTrailPosition = new THREE.Vector3();
  private focusRemaining = 0;
  private focusCooldown = 0;
  private releaseSteeringLockRemaining = 0;
  private stretchReleaseRemaining = 0;
  private readonly lastStretchDirection = new THREE.Vector3(0, 1, 0);
  private lastStretchDistance = 0;

  constructor() {
    super();
    this.isRoot = true;
  }

  public override initialize(options?: ENGINE.PawnOptions): void {
    this.collider = ENGINE.MeshNode.create({
      name: 'SlimeCollider',
      geometry: new THREE.SphereGeometry(MEDIUM_RADIUS, 16, 12),
      selfHidden: true,
      physicsOptions: { enabled: true, contributeToParentCollider: true },
    });
    super.initialize({
      ...options,
      children: [this.collider, ...(options?.children ?? [])],
      physicsOptions: {
        enabled: true,
        motionType: ENGINE.PhysicsMotionType.KinematicPositionBased,
        collisionProfile: ENGINE.DefaultCollisionProfile.Character,
        ...options?.physicsOptions,
      },
    });

    this.massSettings = SlimeMassNode.create({ name: 'MassSettings' });
    this.movementSettings = SlimeMovementSettingsNode.create({ name: 'MovementSettings' });
    this.mover = ENGINE.MoverNode.create({ name: 'SlimeMover' });
    this.mover.addMovementMode(MOVEMENT_MODE, new SlimeMovementMode());
    this.mover.startingModeName = MOVEMENT_MODE;

    const slimeMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xb7db5d,
      emissive: 0x2a4f13,
      emissiveIntensity: 1.25,
      roughness: 0.34,
      metalness: 0,
      transmission: 0.12,
      transparent: true,
      opacity: 0.96,
      clearcoat: 1,
      clearcoatRoughness: 0.24,
    });
    this.visual = ENGINE.MeshNode.create({
      name: 'SlimeVisual',
      geometry: new THREE.SphereGeometry(1, 24, 18),
      material: slimeMaterial,
      physicsOptions: { enabled: false },
      castShadow: true,
    });
    this.faceRoot = ENGINE.SceneNode.create({ name: 'Mass Face' });
    this.addFace();
    this.tetherVisual = this.createStretchVisual(slimeMaterial.clone());
    this.stretchShoulder = ENGINE.MeshNode.create({
      name: 'StretchShoulder',
      geometry: new THREE.SphereGeometry(1, 18, 12),
      material: slimeMaterial.clone(),
      physicsOptions: { enabled: false },
      castShadow: true,
    });
    this.stretchShoulder.visible = false;
    this.stretchTip = ENGINE.MeshNode.create({
      name: 'StretchTip',
      geometry: new THREE.SphereGeometry(1, 18, 12),
      material: slimeMaterial.clone(),
      physicsOptions: { enabled: false },
      castShadow: true,
    });
    this.stretchTip.visible = false;
    this.senseVisual = this.createSenseVisual();
    this.slimeGlow = ENGINE.PointLightNode.create({
      name: 'Mass Bio Glow',
      color: 0xb6e866,
      intensity: 1.8,
      distance: 4.6,
      decay: 2,
      position: new THREE.Vector3(0, 0.2, 1.3),
    });
    this.cameraNode = SlimeCameraNode.create({ name: 'SlimeCamera' });
    this.add(
      this.massSettings,
      this.movementSettings,
      this.mover,
      this.visual,
      this.faceRoot,
      this.tetherVisual,
      this.stretchShoulder,
      this.stretchTip,
      this.senseVisual,
      this.slimeGlow,
      this.cameraNode,
    );
    this.applyMassVisuals(true);
  }

  public override beginPlay(): boolean {
    this.bindChildren();
    if (!super.beginPlay()) return false;
    this.lastTrailPosition.copy(this.getWorldPosition());
    getSlimeGameContext(this.getWorld())?.registerPawn(this);
    return true;
  }

  public override endPlay(): boolean {
    if (!super.endPlay()) return false;
    this.aimedAnchor?.setHighlighted(false, false);
    this.tetherAnchor?.setHighlighted(false, false);
    return true;
  }

  public override getCamera(): THREE.Camera | null {
    return this.cameraNode?.getCamera() ?? super.getCamera();
  }

  public getMover(): ENGINE.MoverNode {
    return this.mover;
  }

  public getMassSettings(): SlimeMassNode {
    return this.massSettings;
  }

  public getMovementSettings(): SlimeMovementSettingsNode {
    return this.movementSettings;
  }

  public getMovementTimeScale(): number {
    return this.focusRemaining > 0 ? RELEASE_FOCUS_TIME_SCALE : 1;
  }

  public isReleaseSteeringLocked(): boolean {
    return this.releaseSteeringLockRemaining > 0;
  }

  public getAnchorAimTolerance(): number {
    return this.focusRemaining > 0 ? 2.35 : 1.5;
  }

  public getVelocity(): THREE.Vector3 {
    return this.mover?.getVelocity().clone() ?? new THREE.Vector3();
  }

  public setTetherMovementInputActive(active: boolean): void {
    this.tetherMovementInputActive = active;
  }

  public getControlledMass(): number {
    return this.controlledMass;
  }

  public getOwnedMass(): number {
    return this.ownedMass;
  }

  public getBodyRadius(): number {
    return colliderRadiusForMass(this.controlledMass);
  }

  public getMoveSpeed(): number {
    const tier = sizeTierForMass(this.controlledMass);
    if (tier === 'small') return this.movementSettings.smallSpeed;
    if (tier === 'large') return this.movementSettings.largeSpeed;
    return this.movementSettings.mediumSpeed;
  }

  public getStretchRange(): number {
    return THREE.MathUtils.clamp(4 + 0.04 * this.controlledMass, 5, 10);
  }

  public teleportTo(position: THREE.Vector3): void {
    this.releaseStretch();
    this.resetStretchPresentation();
    this.releaseSteeringLockRemaining = 0;
    const sync = this.mover.getSyncState() as ENGINE.MovementSyncState;
    sync.position.copy(position);
    sync.velocity.set(0, 0, 0);
    sync.tags = [ENGINE.FALLING_TAG];
    ENGINE.setVerticalVelocity(sync, 0);
    this.position.copy(position);
    this.lastTrailPosition.copy(position);
    this.lastVerticalSpeed = 0;
    this.wasGrounded = false;
    this.cameraNode.resetToTarget();
  }

  public prepareVerticalStage(): void {
    this.cameraNode.offsetY = 2.8;
    this.cameraNode.followLambda = 8.5;
  }

  public addCameraImpulse(amount: number): void {
    this.cameraNode.addImpulse(amount);
  }

  public getTetherAnchorPosition(): THREE.Vector3 | null {
    return this.tetherAnchor?.getWorldPosition().clone() ?? null;
  }

  public getTetherLength(): number {
    if (this.tetherLength <= 0) return this.getStretchRange();
    return Math.min(this.tetherLength, this.getStretchRange());
  }

  public setAimWorldPoint(point: THREE.Vector3): void {
    this.aimPoint.copy(point);
    const context = getSlimeGameContext(this.getWorld());
    const next = context?.updateAnchorHighlights(
      this.aimPoint,
      this.getWorldPosition(),
      this.getStretchRange(),
    ) ?? null;
    this.aimedAnchor = next;
  }

  public beginStretch(): void {
    const context = getSlimeGameContext(this.getWorld());
    const anchor = context?.findAnchorForAim(
      this.aimPoint,
      this.getWorldPosition(),
      this.getStretchRange(),
    ) ?? null;
    if (!anchor) return;
    this.focusRemaining = 0;
    this.releaseSteeringLockRemaining = 0;
    this.tetherAnchor = anchor;
    let targetLength = anchor.preferredTetherLength > 0
      ? anchor.preferredTetherLength
      : this.movementSettings.swingTetherLength;
    targetLength = Math.min(targetLength, 1.5);
    const attachDistance = anchor.getWorldPosition().distanceTo(this.getWorldPosition());
    this.tetherRestLength = Math.min(
      attachDistance,
      targetLength,
    );
    this.tetherLength = attachDistance;
    this.tetherIdleElapsed = 0;
    this.tetherIdleExtension = 0;
    anchor.setHighlighted(true, true);
    this.tetherVisual.visible = true;
    this.stretchShoulder.visible = true;
    this.stretchTip.visible = true;
    this.stretchReleaseRemaining = 0;
    context?.playFeedback('attach', anchor.getWorldPosition());
    this.cameraNode.addImpulse(0.08);
    context?.setPhase('feed');
  }

  public releaseStretch(): void {
    if (!this.tetherAnchor) return;
    const sync = this.mover.getSyncState() as ENGINE.MovementSyncState;
    const speed = sync.velocity.length();
    if (speed > this.movementSettings.maxReleaseSpeed) {
      sync.velocity.setLength(this.movementSettings.maxReleaseSpeed);
    }
    ENGINE.setVerticalVelocity(sync, sync.velocity.y);
    getSlimeGameContext(this.getWorld())?.playFeedback('release', this.getWorldPosition());
    this.tetherAnchor.setHighlighted(false, false);
    this.tetherAnchor = null;
    this.tetherLength = 0;
    this.tetherRestLength = 0;
    this.tetherIdleElapsed = 0;
    this.tetherIdleExtension = 0;
    this.stretchReleaseRemaining = 0.18;
    this.releaseSteeringLockRemaining = RELEASE_STEERING_LOCK_DURATION;
    if (this.focusCooldown <= 0) {
      this.focusRemaining = RELEASE_FOCUS_DURATION;
      this.focusCooldown = 0.55;
    }
  }

  public beginSplitCharge(): void {
    if (this.splitCharging) return;
    this.splitCharging = true;
    this.splitChargeElapsed = 0;
    this.updateChargeHud();
  }

  public commitSplit(directionX: number): void {
    if (!this.splitCharging) return;
    const amount = this.getSplitPreviewAmount();
    this.splitCharging = false;
    this.updateChargeHud();
    if (amount < this.massSettings.minimumPieceMass) return;
    getSlimeGameContext(this.getWorld())?.splitControlled(
      amount,
      this.getWorldPosition().clone(),
      directionX === 0 ? 1 : Math.sign(directionX),
    );
  }

  public pulseSense(): void {
    const piece = getSlimeGameContext(this.getWorld())?.senseNextPiece() ?? null;
    if (!piece) return;
    this.senseTarget = piece;
    this.senseVisualRemaining = 0.8;
    this.senseVisual.visible = true;
  }

  public applyMassSnapshot(snapshot: MassSnapshot): void {
    this.controlledMass = snapshot.controlledMass;
    this.ownedMass = snapshot.ownedMass;
    this.applyMassVisuals(false);
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.elapsed += deltaTime;
    if (this.getWorldPosition().y < -4) {
      getSlimeGameContext(this.getWorld())?.recoverFromVerticalFall();
    }
    this.focusRemaining = Math.max(0, this.focusRemaining - deltaTime);
    this.focusCooldown = Math.max(0, this.focusCooldown - deltaTime);
    this.releaseSteeringLockRemaining = Math.max(
      0,
      this.releaseSteeringLockRemaining - deltaTime,
    );
    this.stretchReleaseRemaining = Math.max(0, this.stretchReleaseRemaining - deltaTime);
    this.updateTetherLength(deltaTime);
    if (this.splitCharging) {
      this.splitChargeElapsed = Math.min(
        this.splitChargeElapsed + deltaTime,
        this.massSettings.splitChargeDuration,
      );
      this.updateChargeHud();
    }
  }

  public override tickPostPhysics(deltaTime: number): void {
    super.tickPostPhysics(deltaTime);
    const velocity = this.mover?.getVelocity() ?? new THREE.Vector3();
    const grounded = this.mover?.hasSyncTag(ENGINE.GROUNDED_TAG, true) ?? false;
    const context = getSlimeGameContext(this.getWorld());
    if (grounded && !this.wasGrounded && this.lastVerticalSpeed < -5 && context?.isGameplayActive()) {
      context.playFeedback('land', this.getWorldPosition());
      this.cameraNode.addImpulse(THREE.MathUtils.clamp(Math.abs(this.lastVerticalSpeed) / 75, 0.1, 0.26));
    }
    this.updateTrail(deltaTime, velocity, grounded, context?.isGameplayActive() ?? false);
    this.wasGrounded = grounded;
    this.lastVerticalSpeed = velocity.y;
    const radius = visualRadiusForMass(this.controlledMass);
    const speedStretch = THREE.MathUtils.clamp(velocity.length() / 24, 0, 0.16);
    const wobble = Math.sin(this.elapsed * 7) * 0.025;
    if (this.tetherAnchor) {
      const target = this.tetherAnchor.getWorldPosition();
      const delta = target.clone().sub(this.getWorldPosition());
      const distance = Math.max(delta.length(), 0.001);
      this.lastStretchDirection.copy(delta).multiplyScalar(1 / distance);
      this.lastStretchDistance = distance;
      this.updateOrganicStretch(target, radius, velocity.length());
    } else if (this.stretchReleaseRemaining > 0) {
      const recoilAlpha = THREE.MathUtils.smoothstep(this.stretchReleaseRemaining, 0, 0.18);
      const recoilDistance = Math.max(radius * 0.3, this.lastStretchDistance * recoilAlpha);
      const target = this.getWorldPosition().clone().addScaledVector(this.lastStretchDirection, recoilDistance);
      this.updateOrganicStretch(target, radius, velocity.length());
    } else {
      this.resetStretchPresentation();
      const velocityAngle = velocity.lengthSq() > 2
        ? -Math.atan2(velocity.x, velocity.y)
        : 0;
      this.visual.rotation.z = THREE.MathUtils.lerp(this.visual.rotation.z, velocityAngle, 0.08);
      this.visual.scale.set(
        radius * (1 - speedStretch * 0.35),
        radius * (0.86 + speedStretch + wobble),
        radius * 0.92,
      );
    }
    // The slime body can squash, stretch, and rotate with momentum, but its
    // expression stays readable and level like a hand-animated 2D character.
    this.faceRoot.rotation.set(0, 0, 0);
    this.faceRoot.scale.setScalar(radius);
    this.slimeGlow.intensity = 1.45 + Math.min(this.controlledMass / 220, 0.75)
      + (this.tetherAnchor ? 0.32 : 0)
      + Math.sin(this.elapsed * 3.1) * 0.08;
    this.slimeGlow.distance = 4.1 + Math.min(this.controlledMass / 100, 1.4);
    if (this.senseVisualRemaining > 0 && this.senseTarget?.isPlaying()) {
      this.senseVisualRemaining -= deltaTime;
      this.updateLineVisual(this.senseVisual, this.senseTarget.getWorldPosition());
      if (this.senseVisualRemaining <= 0) this.senseVisual.visible = false;
    } else if (this.senseVisualRemaining <= 0) {
      this.senseVisual.visible = false;
      this.senseTarget = null;
    }
  }

  private updateTrail(deltaTime: number, velocity: THREE.Vector3, grounded: boolean, active: boolean): void {
    if (!active || !grounded || Math.abs(velocity.x) < 1.8) {
      this.trailElapsed = 0;
      return;
    }
    this.trailElapsed += deltaTime;
    const position = this.getWorldPosition();
    if (this.trailElapsed < 0.1 && position.distanceToSquared(this.lastTrailPosition) < 0.16) return;
    this.trailElapsed = 0;
    this.lastTrailPosition.copy(position);
    const radius = visualRadiusForMass(this.controlledMass);
    const trail = SlimeTrailNode.create({
      name: 'Slime Trail',
      position: position.clone().add(new THREE.Vector3(-Math.sign(velocity.x) * radius * 0.45, -radius * 0.52, 0.14)),
    });
    trail.configure(new THREE.Vector3(radius * 1.45, radius * 0.24, radius * 0.72), 0.72);
    this.getWorld()?.add(trail);
  }

  private updateTetherLength(deltaTime: number): void {
    if (!this.tetherAnchor || this.tetherRestLength <= 0) return;
    const anchorPosition = this.tetherAnchor.getWorldPosition();
    const toAnchor = anchorPosition.sub(this.getWorldPosition());
    const distance = toAnchor.length();
    if (distance <= 0.001) return;
    const direction = toAnchor.multiplyScalar(1 / distance);
    const tangent = new THREE.Vector3(direction.y, -direction.x, 0);
    const tangentialSpeed = Math.abs(this.getVelocity().dot(tangent));
    const settings = this.movementSettings;
    if (this.tetherMovementInputActive) {
      this.tetherIdleElapsed = 0;
      const recoveryRate = settings.idleStretchDistance / settings.idleStretchRecoveryDuration;
      this.tetherIdleExtension = Math.max(0, this.tetherIdleExtension - recoveryRate * deltaTime);
    } else {
      this.tetherIdleElapsed += deltaTime;
      if (this.tetherIdleElapsed > settings.idleStretchDelay) {
        const stretchRate = settings.idleStretchDistance / settings.idleStretchDuration;
        this.tetherIdleExtension = Math.min(
          settings.idleStretchDistance,
          this.tetherIdleExtension + stretchRate * deltaTime,
        );
      }
    }
    const stretchAlpha = THREE.MathUtils.smoothstep(
      tangentialSpeed,
      settings.swingStretchStartSpeed,
      settings.swingStretchFullSpeed,
    );
    const momentumExtension = settings.swingStretchDistance * stretchAlpha;
    const targetLength = this.tetherRestLength + Math.max(momentumExtension, this.tetherIdleExtension);
    const responsiveness = targetLength > this.tetherLength
      ? settings.tetherStretchResponsiveness
      : settings.tetherRecoveryResponsiveness;
    const blend = 1 - Math.exp(-responsiveness * Math.max(deltaTime, 0));
    const desiredLength = THREE.MathUtils.lerp(this.tetherLength, targetLength, blend);
    if (desiredLength < this.tetherLength) {
      this.tetherLength = Math.max(
        desiredLength,
        this.tetherLength - settings.maxTetherReelSpeed * Math.max(deltaTime, 0),
      );
    } else {
      this.tetherLength = desiredLength;
    }
  }

  private bindChildren(): void {
    this.collider = this.getNodes(ENGINE.MeshNode).find((node) => node.name === 'SlimeCollider') ?? this.collider;
    this.visual = this.getNodes(ENGINE.MeshNode).find((node) => node.name === 'SlimeVisual') ?? this.visual;
    this.faceRoot = this.getNodes(ENGINE.SceneNode).find((node) => node.name === 'Mass Face') ?? this.faceRoot;
    this.tetherVisual = this.getNodes(ENGINE.MeshNode).find((node) => node.name === 'StretchTendril') ?? this.tetherVisual;
    this.stretchShoulder = this.getNodes(ENGINE.MeshNode).find((node) => node.name === 'StretchShoulder') ?? this.stretchShoulder;
    this.stretchTip = this.getNodes(ENGINE.MeshNode).find((node) => node.name === 'StretchTip') ?? this.stretchTip;
    this.senseVisual = this.getNodes(ENGINE.MeshNode).find((node) => node.name === 'SenseTendril') ?? this.senseVisual;
    this.mover = this.getNode(ENGINE.MoverNode) ?? this.mover;
    this.cameraNode = this.getNode(SlimeCameraNode) ?? this.cameraNode;
    this.massSettings = this.getNode(SlimeMassNode) ?? this.massSettings;
    this.movementSettings = this.getNode(SlimeMovementSettingsNode) ?? this.movementSettings;
    this.slimeGlow = this.getNodes(ENGINE.PointLightNode).find((node) => node.name === 'Mass Bio Glow') ?? this.slimeGlow;
    this.mover.addMovementMode(MOVEMENT_MODE, new SlimeMovementMode());
    this.mover.startingModeName = MOVEMENT_MODE;
  }

  private createStretchVisual(material: THREE.Material): ENGINE.MeshNode {
    const line = ENGINE.MeshNode.create({
      name: 'StretchTendril',
      geometry: new THREE.CylinderGeometry(0.075, 0.34, 1, 18, 5),
      material,
      physicsOptions: { enabled: false },
    });
    line.visible = false;
    return line;
  }

  private addFace(): void {
    const ink = new THREE.MeshBasicMaterial({ color: 0x07100b });
    const shine = new THREE.MeshBasicMaterial({ color: 0xf4ffd5 });
    const createEye = (name: string, x: number): void => {
      const eye = ENGINE.MeshNode.create({
        name,
        geometry: new THREE.SphereGeometry(0.17, 14, 10),
        material: ink,
        position: new THREE.Vector3(x, 0.1, 0.91),
        scale: new THREE.Vector3(0.78, 1.12, 0.32),
        physicsOptions: { enabled: false },
      });
      const glint = ENGINE.MeshNode.create({
        name: `${name} Glint`,
        geometry: new THREE.SphereGeometry(0.045, 8, 6),
        material: shine,
        position: new THREE.Vector3(-0.03, 0.05, 0.16),
        physicsOptions: { enabled: false },
      });
      eye.add(glint);
      this.faceRoot.add(eye);
    };
    createEye('Mass Left Eye', -0.25);
    createEye('Mass Right Eye', 0.25);
    this.faceRoot.add(ENGINE.MeshNode.create({
      name: 'Mass Mouth',
      geometry: new THREE.SphereGeometry(0.12, 12, 8),
      material: ink,
      position: new THREE.Vector3(0, -0.18, 0.93),
      scale: new THREE.Vector3(0.95, 0.28, 0.25),
      physicsOptions: { enabled: false },
    }));
  }

  private createSenseVisual(): ENGINE.MeshNode {
    const line = ENGINE.MeshNode.create({
      name: 'SenseTendril',
      geometry: new THREE.CylinderGeometry(0.1, 0.14, 1, 12),
      material: new THREE.MeshBasicMaterial({ color: 0xb987ff, transparent: true, opacity: 0.65 }),
      physicsOptions: { enabled: false },
    });
    line.visible = false;
    return line;
  }

  private updateLineVisual(line: ENGINE.MeshNode, targetWorld: THREE.Vector3): void {
    const origin = this.getWorldPosition();
    const delta = targetWorld.clone().sub(origin);
    const distance = Math.max(delta.length(), 0.001);
    line.position.copy(targetWorld.clone().add(origin).multiplyScalar(0.5).sub(origin));
    line.rotation.set(0, 0, -Math.atan2(delta.x, delta.y));
    line.scale.set(1, distance, 1);
  }

  private updateOrganicStretch(targetWorld: THREE.Vector3, radius: number, speed: number): void {
    const origin = this.getWorldPosition();
    const delta = targetWorld.clone().sub(origin);
    const distance = Math.max(delta.length(), 0.001);
    const direction = delta.clone().multiplyScalar(1 / distance);
    const angle = -Math.atan2(delta.x, delta.y);
    const tension = THREE.MathUtils.clamp((distance - radius) / Math.max(this.getStretchRange(), 1), 0, 1);
    const wobble = Math.sin(this.elapsed * 8.5 + distance) * Math.min(0.035, speed * 0.0018);

    this.tetherVisual.visible = true;
    this.stretchShoulder.visible = true;
    this.stretchTip.visible = true;
    this.tetherVisual.position.copy(direction).multiplyScalar(distance * 0.5 + radius * 0.08);
    this.tetherVisual.position.x += -direction.y * wobble;
    this.tetherVisual.position.y += direction.x * wobble;
    this.tetherVisual.rotation.set(0, 0, angle);
    this.tetherVisual.scale.set(1 + tension * 0.28, Math.max(0.05, distance - radius * 0.18), 0.84);

    this.stretchShoulder.position.copy(direction).multiplyScalar(radius * 0.56);
    this.stretchShoulder.rotation.set(0, 0, angle);
    this.stretchShoulder.scale.set(
      radius * (0.66 - tension * 0.15),
      radius * (1.08 + tension * 1.12),
      radius * (0.7 - tension * 0.08),
    );
    this.stretchTip.position.copy(direction).multiplyScalar(Math.max(radius, distance - 0.08));
    this.stretchTip.scale.setScalar(radius * 0.18);

    this.visual.rotation.z = angle;
    this.visual.scale.set(
      radius * (0.92 - tension * 0.2),
      radius * (0.88 + tension * 0.62 + Math.sin(this.elapsed * 6.5) * 0.018),
      radius * (0.92 - tension * 0.09),
    );
  }

  private resetStretchPresentation(): void {
    this.tetherVisual.visible = false;
    this.stretchShoulder.visible = false;
    this.stretchTip.visible = false;
    this.stretchReleaseRemaining = 0;
  }

  private getSplitPreviewAmount(): number {
    const ratio = THREE.MathUtils.lerp(
      0.1,
      0.7,
      THREE.MathUtils.clamp(this.splitChargeElapsed / this.massSettings.splitChargeDuration, 0, 1),
    );
    return Math.max(
      0,
      Math.min(
        this.controlledMass * ratio,
        this.controlledMass - this.massSettings.minimumControlledMass,
      ),
    );
  }

  private updateChargeHud(): void {
    getSlimeGameContext(this.getWorld())?.updateSplitCharge(
      this.splitCharging ? this.getSplitPreviewAmount() : 0,
      Math.max(0, this.controlledMass - this.massSettings.minimumControlledMass),
      this.splitCharging,
    );
  }

  private applyMassVisuals(initial: boolean): void {
    const nextTier = sizeTierForMass(this.controlledMass);
    const nextRadius = colliderRadiusForMass(this.controlledMass);
    if (initial || nextTier !== this.currentTier) {
      const previousRadius = colliderRadiusForMass(
        this.currentTier === 'small' ? 60 : this.currentTier === 'large' ? 121 : 100,
      );
      this.collider.geometry = new THREE.SphereGeometry(nextRadius, 16, 12);
      if (!initial && this.mover?.hasSyncTag(ENGINE.GROUNDED_TAG, true)) {
        const lift = nextRadius - previousRadius;
        const sync = this.mover.getSyncState() as ENGINE.MovementSyncState;
        sync.position.y += lift;
        this.position.y += lift;
      }
      this.currentTier = nextTier;
    }
    const radius = visualRadiusForMass(this.controlledMass);
    this.visual?.scale.set(radius, radius * 0.86, radius * 0.92);
    this.faceRoot?.scale.setScalar(radius);
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_Character';
  }
}
