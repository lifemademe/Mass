import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

@ENGINE.GameClass()
export class SlimeTrailNode extends ENGINE.MeshNode {
  private lifetime = 0.7;
  private elapsed = 0;
  private startScale = new THREE.Vector3(1, 1, 1);

  constructor() {
    super();
    this.isRoot = true;
  }

  public override initialize(options?: ENGINE.MeshNodeOptions): void {
    super.initialize({
      geometry: new THREE.SphereGeometry(0.22, 10, 6),
      material: new THREE.MeshBasicMaterial({
        color: 0x5ef0c2,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
      physicsOptions: { enabled: false },
      ...options,
    });
  }

  public configure(scale: THREE.Vector3, lifetime = 0.7): void {
    this.startScale.copy(scale);
    this.scale.copy(scale);
    this.lifetime = lifetime;
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.elapsed += deltaTime;
    const ratio = THREE.MathUtils.clamp(this.elapsed / this.lifetime, 0, 1);
    this.scale.copy(this.startScale).multiplyScalar(1 - ratio * 0.55);
    const material = this.material;
    if (material instanceof THREE.MeshBasicMaterial) material.opacity = 0.32 * (1 - ratio);
    if (ratio >= 1) this.destroy();
  }
}

@ENGINE.GameClass()
export class SlimeShockwaveNode extends ENGINE.MeshNode {
  private lifetime = 0.55;
  private elapsed = 0;
  private targetScale = 1;

  constructor() {
    super();
    this.isRoot = true;
  }

  public override initialize(options?: ENGINE.MeshNodeOptions): void {
    super.initialize({
      geometry: new THREE.TorusGeometry(0.5, 0.055, 8, 28),
      material: new THREE.MeshBasicMaterial({
        color: 0x75ffd3,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      }),
      physicsOptions: { enabled: false },
      ...options,
    });
  }

  public configure(color: THREE.ColorRepresentation, targetScale: number, lifetime = 0.55): void {
    const material = this.material;
    if (material instanceof THREE.MeshBasicMaterial) material.color.set(color);
    this.targetScale = targetScale;
    this.lifetime = lifetime;
    this.scale.setScalar(0.25);
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.elapsed += deltaTime;
    const ratio = THREE.MathUtils.clamp(this.elapsed / this.lifetime, 0, 1);
    const eased = 1 - (1 - ratio) * (1 - ratio);
    this.scale.setScalar(THREE.MathUtils.lerp(0.25, this.targetScale, eased));
    const material = this.material;
    if (material instanceof THREE.MeshBasicMaterial) material.opacity = 0.72 * (1 - ratio);
    if (ratio >= 1) this.destroy();
  }
}
