/**
 * SideScrollCameraComponent - perspective follow camera for side-on 2D gameplay.
 *
 * The engine ships no side-scroll follow camera, so this owns a `THREE.PerspectiveCamera`
 * fixed on the +Z side of the play plane, looking down -Z. Each post-physics tick it damps
 * toward the owning actor's X (and Y, within a vertical dead-zone), then clamps to the
 * configured level bounds. `resetToTarget()` snaps instantly (used on respawn).
 */
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { combatFeel } from '../feel/CombatFeel.js';

export interface SideScrollCameraBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface SideScrollCameraComponentOptions extends ENGINE.SceneNodeOptions {
  /** Distance from the play plane along +Z. */
  distance?: number;
  /** Vertical offset added to the target so the character sits slightly low on screen. */
  offsetY?: number;
  /** Horizontal follow responsiveness (higher = snappier). */
  followLambdaX?: number;
  /** Vertical follow responsiveness (usually softer than horizontal). */
  followLambdaY?: number;
  /** Half-height of a vertical dead-zone; the camera only tracks Y past this band. */
  verticalDeadzone?: number;
  /** Camera field of view in degrees. */
  fov?: number;
  /** Optional initial level bounds. */
  bounds?: SideScrollCameraBounds;
}

@ENGINE.GameClass()
export class SideScrollCameraComponent extends ENGINE.SceneNode {
  /** Kept as a hidden property so prefab/scene load rebinds the PerspectiveCamera child. */
  @ENGINE.property({ hidden: true })
  protected camera!: THREE.PerspectiveCamera;

  @ENGINE.property({
    type: 'number',
    category: 'Camera',
    min: 2,
    max: 80,
    step: 0.5,
    description: 'Distance from the play plane along +Z (units).',
  })
  public distance = 20;

  @ENGINE.property({
    type: 'number',
    category: 'Camera',
    min: -5,
    max: 10,
    step: 0.1,
    description: 'Vertical offset added to the follow target so the character sits lower on screen.',
  })
  public offsetY = 1.5;

  @ENGINE.property({
    type: 'number',
    category: 'Camera',
    min: 0.5,
    max: 30,
    step: 0.1,
    description: 'Horizontal follow responsiveness (higher = snappier).',
  })
  public followLambdaX = 8;

  @ENGINE.property({
    type: 'number',
    category: 'Camera',
    min: 0.5,
    max: 30,
    step: 0.1,
    description: 'Vertical follow responsiveness (higher = snappier; usually softer than X).',
  })
  public followLambdaY = 5;

  @ENGINE.property({
    type: 'number',
    category: 'Camera',
    min: 0,
    max: 8,
    step: 0.1,
    description: 'Half-height of the vertical dead-zone; camera only tracks Y past this band.',
  })
  public verticalDeadzone = 1.5;

  @ENGINE.property({
    type: 'number',
    category: 'Camera',
    min: 20,
    max: 90,
    step: 1,
    description: 'Perspective field of view in degrees.',
  })
  public fov = 50;

  private bounds: SideScrollCameraBounds | null = null;

  private readonly cameraCenter = new THREE.Vector3();

  public override initialize(options?: SideScrollCameraComponentOptions): void {
    super.initialize(options);
    this.distance = options?.distance ?? this.distance;
    this.offsetY = options?.offsetY ?? this.offsetY;
    this.followLambdaX = options?.followLambdaX ?? this.followLambdaX;
    this.followLambdaY = options?.followLambdaY ?? this.followLambdaY;
    this.verticalDeadzone = options?.verticalDeadzone ?? this.verticalDeadzone;
    this.fov = options?.fov ?? this.fov;
    this.bounds = options?.bounds ?? this.bounds;
    this.ensureCamera();
  }

  public override postLoad(): void {
    super.postLoad();
    // Prefab/scene deserialize restores children but may leave the field unbound.
    this.ensureCamera();
  }

  /** Resolve or create the PerspectiveCamera used for play-mode follow. */
  private ensureCamera(): THREE.PerspectiveCamera {
    if (this.camera) {
      return this.camera;
    }

    const existing = this.children.find(
      (child): child is THREE.PerspectiveCamera => (child as THREE.PerspectiveCamera).isPerspectiveCamera === true,
    );
    if (existing) {
      this.camera = existing;
    } else {
      this.camera = new THREE.PerspectiveCamera(this.fov, 1, 0.1, 2000);
      this.camera.name = 'SideScrollCamera';
      this.add(this.camera);
    }

    this.camera.enabled = true;
    // Drive the camera in world space so the (non-rotating) pawn root never drags it around.
    this.camera.useAbsolutePosition = true;
    this.camera.useAbsoluteRotation = true;
    return this.camera;
  }

  /** Set the level bounds the camera center is clamped within. */
  public setBounds(bounds: SideScrollCameraBounds): void {
    this.bounds = bounds;
  }

  public override getCamera(): THREE.PerspectiveCamera {
    return this.ensureCamera();
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) {
      return false;
    }
    this.ensureCamera();
    this.snapToTarget();
    return true;
  }

  public override tickPostPhysics(deltaTime: number): void {
    super.tickPostPhysics(deltaTime);

    const camera = this.ensureCamera();
    if (camera.fov !== this.fov) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }

    // Advance shake even during hit-stop so the punch still reads.
    combatFeel.tick(deltaTime);

    const target = this.getTargetCenter();
    if (!target) return;

    if (!combatFeel.isFrozen()) {
      this.cameraCenter.x = THREE.MathUtils.damp(this.cameraCenter.x, target.x, this.followLambdaX, deltaTime);

      const dy = target.y - this.cameraCenter.y;
      if (Math.abs(dy) > this.verticalDeadzone) {
        const edge = target.y - Math.sign(dy) * this.verticalDeadzone;
        this.cameraCenter.y = THREE.MathUtils.damp(this.cameraCenter.y, edge, this.followLambdaY, deltaTime);
      }
    }

    this.applyCenter();
  }

  /** Snap the camera to the current target instantly (respawn / level start). */
  public resetToTarget(): void {
    this.snapToTarget();
  }

  private snapToTarget(): void {
    const target = this.getTargetCenter();
    if (!target) return;
    this.cameraCenter.copy(target);
    this.applyCenter();
  }

  private getTargetCenter(): THREE.Vector3 | null {
    const root = this.getRoot();
    if (!root) return null;
    const pos = root.getWorldPosition();
    return new THREE.Vector3(pos.x, pos.y + this.offsetY, 0);
  }

  private applyCenter(): void {
    const camera = this.ensureCamera();
    let x = this.cameraCenter.x;
    let y = this.cameraCenter.y;
    if (this.bounds) {
      x = THREE.MathUtils.clamp(x, this.bounds.minX, this.bounds.maxX);
      y = THREE.MathUtils.clamp(y, this.bounds.minY, this.bounds.maxY);
    }
    const shake = combatFeel.sampleShakeOffset();
    camera.position.set(x + shake.x, y + shake.y, this.distance);
    camera.rotation.set(0, 0, 0);
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_Camera';
  }
}
