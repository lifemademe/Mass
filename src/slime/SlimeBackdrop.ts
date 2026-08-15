import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { getSlimeGameContext } from './SlimeRuntime.js';

export type ParallaxAxis = 'horizontal' | 'vertical' | 'both';

interface SlimeBackdropOptions {
  name: string;
  texturePath: string;
  position: THREE.Vector3;
  size: THREE.Vector2;
  tint?: THREE.ColorRepresentation;
  opacity?: number;
  parallaxRatio?: number;
  axis?: ParallaxAxis;
  renderOrder?: number;
  opaque?: boolean;
  /**
   * Use the texture's colour as a fallback cutout mask. Generated foreground
   * frames have a transparent centre in source PNGs, but some baked runtime
   * texture formats can lose that alpha channel and render the centre black.
   */
  maskBlack?: boolean;
}

interface SlimeSpriteOptions {
  name: string;
  texturePath: string;
  position: THREE.Vector3;
  size: THREE.Vector2;
  tint?: THREE.ColorRepresentation;
  opacity?: number;
  renderOrder?: number;
}

@ENGINE.GameClass()
export class SlimeParallaxNode extends ENGINE.MeshNode {
  private readonly authoredOrigin = new THREE.Vector3();
  private readonly cameraOrigin = new THREE.Vector3();
  private parallaxRatio = 0.3;
  private axis: ParallaxAxis = 'both';
  private hasReference = false;

  public configureParallax(ratio: number, axis: ParallaxAxis): void {
    this.parallaxRatio = ratio;
    this.axis = axis;
    this.authoredOrigin.copy(this.position);
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) return false;
    this.authoredOrigin.copy(this.position);
    this.hasReference = false;
    return true;
  }

  public override tickPostPhysics(deltaTime: number): void {
    super.tickPostPhysics(deltaTime);
    const camera = getSlimeGameContext(this.getWorld())?.getPawn()?.getCamera() ?? null;
    if (!camera) return;
    const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
    if (!this.hasReference) {
      this.cameraOrigin.copy(cameraPosition);
      this.authoredOrigin.copy(this.position);
      this.hasReference = true;
    }
    const follow = 1 - this.parallaxRatio;
    if (this.axis !== 'vertical') {
      this.position.x = this.authoredOrigin.x + (cameraPosition.x - this.cameraOrigin.x) * follow;
    }
    if (this.axis !== 'horizontal') {
      this.position.y = this.authoredOrigin.y + (cameraPosition.y - this.cameraOrigin.y) * follow;
    }
  }
}

/** Non-colliding, camera-relative art plane with publish-safe texture loading. */
export function createSlimeBackdrop(options: SlimeBackdropOptions): SlimeParallaxNode {
  const material = new THREE.MeshBasicMaterial({
    color: options.tint ?? 0xffffff,
    fog: false,
    transparent: !options.opaque,
    opacity: options.opacity ?? 1,
    alphaTest: options.opaque ? 0 : 0.01,
    depthWrite: options.opaque ?? false,
    side: THREE.DoubleSide,
  });
  const backdrop = SlimeParallaxNode.create({
    name: options.name,
    geometry: new THREE.PlaneGeometry(1, 1),
    material,
    position: options.position,
    scale: new THREE.Vector3(options.size.x, options.size.y, 1),
    castShadow: false,
    receiveShadow: false,
    physicsOptions: { enabled: false },
  });
  backdrop.renderOrder = options.renderOrder ?? -100;
  backdrop.frustumCulled = false;
  backdrop.configureParallax(options.parallaxRatio ?? 0.3, options.axis ?? 'both');

  void ENGINE.resourceManager
    .loadTexture(ENGINE.AssetPath.fromString(options.texturePath))
    .then((texture) => {
      if (!texture) return;
      texture.colorSpace = THREE.SRGBColorSpace;
      // Project textures are authored upright. The WebGPU texture upload path
      // already handles the GPU coordinate convention, so a second Y flip
      // turns illustrated backdrops upside down.
      texture.flipY = false;
      texture.needsUpdate = true;
      material.map = texture;
      if (options.maskBlack) {
        const alphaMask = texture.clone();
        alphaMask.colorSpace = THREE.NoColorSpace;
        alphaMask.flipY = false;
        alphaMask.needsUpdate = true;
        material.alphaMap = alphaMask;
        material.alphaTest = 0.015;
      }
      material.needsUpdate = true;
    });

  return backdrop;
}

/** Unlit illustrated gameplay dressing that stays fixed in world space. */
export function createSlimeSprite(options: SlimeSpriteOptions): ENGINE.MeshNode {
  const material = new THREE.MeshBasicMaterial({
    color: options.tint ?? 0xffffff,
    transparent: true,
    opacity: options.opacity ?? 1,
    alphaTest: 0.015,
    depthWrite: false,
    depthTest: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const sprite = ENGINE.MeshNode.create({
    name: options.name,
    geometry: new THREE.PlaneGeometry(1, 1),
    material,
    position: options.position,
    scale: new THREE.Vector3(options.size.x, options.size.y, 1),
    castShadow: false,
    receiveShadow: false,
    physicsOptions: { enabled: false },
  });
  sprite.renderOrder = options.renderOrder ?? 58;
  sprite.frustumCulled = false;
  void ENGINE.resourceManager
    .loadTexture(ENGINE.AssetPath.fromString(options.texturePath))
    .then((texture) => {
      if (!texture) return;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.needsUpdate = true;
      material.map = texture;
      material.needsUpdate = true;
    });
  return sprite;
}

export function createSlimeHaze(
  name: string,
  position: THREE.Vector3,
  size: THREE.Vector2,
  axis: ParallaxAxis,
): SlimeParallaxNode {
  // Genesys renders through WebGPU/TSL; raw THREE.ShaderMaterial is not
  // supported and aborts the scene render. Keep this atmospheric veil on a
  // standard engine-compatible material.
  const material = new THREE.MeshBasicMaterial({
    color: 0x86c9a3,
    transparent: true,
    opacity: 0.045,
    depthWrite: false,
    depthTest: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const haze = SlimeParallaxNode.create({
    name,
    geometry: new THREE.PlaneGeometry(1, 1),
    material,
    position,
    scale: new THREE.Vector3(size.x, size.y, 1),
    castShadow: false,
    receiveShadow: false,
    physicsOptions: { enabled: false },
  });
  haze.renderOrder = 45;
  haze.configureParallax(0.1, axis);
  return haze;
}

export function createSlimeOccluder(
  name: string,
  position: THREE.Vector3,
  size: THREE.Vector2,
  axis: ParallaxAxis,
): SlimeParallaxNode {
  const material = new THREE.MeshBasicMaterial({
    color: 0x010403,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    depthTest: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const occluder = SlimeParallaxNode.create({
    name,
    geometry: new THREE.PlaneGeometry(1, 1),
    material,
    position,
    scale: new THREE.Vector3(size.x, size.y, 1),
    castShadow: false,
    receiveShadow: false,
    physicsOptions: { enabled: false },
  });
  occluder.renderOrder = 90;
  occluder.configureParallax(1.2, axis);
  return occluder;
}
