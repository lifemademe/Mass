import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

@ENGINE.GameClass()
export class SlimeCameraNode extends ENGINE.SceneNode {
  @ENGINE.property({ hidden: true })
  protected camera!: THREE.PerspectiveCamera;

  @ENGINE.property({ type: 'number', category: 'Camera', min: 8, max: 50, step: 0.5 })
  public distance = 22;

  @ENGINE.property({ type: 'number', category: 'Camera', min: -5, max: 10, step: 0.1 })
  public offsetY = 2;

  @ENGINE.property({ type: 'number', category: 'Camera', min: 0.5, max: 30, step: 0.1 })
  public followLambda = 7;

  private readonly center = new THREE.Vector3();
  private trauma = 0;
  private shakeTime = 0;

  public override initialize(options?: ENGINE.SceneNodeOptions): void {
    super.initialize(options);
    this.ensureCamera();
  }

  public override postLoad(): void {
    super.postLoad();
    this.ensureCamera();
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) return false;
    this.snap();
    return true;
  }

  public override tickPostPhysics(deltaTime: number): void {
    super.tickPostPhysics(deltaTime);
    const root = this.getRoot();
    if (!root) return;
    const target = root.getWorldPosition().add(new THREE.Vector3(2.5, this.offsetY, 0));
    this.center.x = THREE.MathUtils.damp(this.center.x, target.x, this.followLambda, deltaTime);
    this.center.y = THREE.MathUtils.damp(this.center.y, target.y, this.followLambda, deltaTime);
    this.trauma = Math.max(0, this.trauma - deltaTime * 1.7);
    this.shakeTime += deltaTime;
    this.apply();
  }

  public override getCamera(): THREE.PerspectiveCamera {
    return this.ensureCamera();
  }

  public resetToTarget(): void {
    this.trauma = 0;
    this.snap();
  }

  public addImpulse(amount: number): void {
    this.trauma = THREE.MathUtils.clamp(this.trauma + amount, 0, 1);
  }

  private ensureCamera(): THREE.PerspectiveCamera {
    if (this.camera) return this.camera;
    const existing = this.children.find(
      (child): child is THREE.PerspectiveCamera => (child as THREE.PerspectiveCamera).isPerspectiveCamera === true,
    );
    if (existing) {
      this.camera = existing;
    } else {
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
      camera.name = 'SlimeSideScrollCamera';
      this.camera = camera;
      this.add(this.camera);
    }
    this.camera.enabled = true;
    this.camera.useAbsolutePosition = true;
    this.camera.useAbsoluteRotation = true;
    return this.camera;
  }

  private snap(): void {
    const root = this.getRoot();
    if (!root) return;
    this.center.copy(root.getWorldPosition()).add(new THREE.Vector3(2.5, this.offsetY, 0));
    this.apply();
  }

  private apply(): void {
    const camera = this.ensureCamera();
    const strength = this.trauma * this.trauma;
    const shakeX = Math.sin(this.shakeTime * 39) * 0.16 * strength;
    const shakeY = Math.sin(this.shakeTime * 47 + 1.4) * 0.12 * strength;
    camera.position.set(this.center.x + shakeX, this.center.y + shakeY, this.distance);
    camera.rotation.set(0, 0, Math.sin(this.shakeTime * 31) * 0.006 * strength);
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_Camera';
  }
}
