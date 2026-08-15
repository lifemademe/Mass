import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';

import type { TexturePath } from '@gnsx/genesys.js';

/**
 * World-space triplanar material. Samples the texture three times using
 * world-position XZ, XY, and YZ planes, then blends by the world normal —
 * no per-mesh UV coordinates required.
 */
@ENGINE.GameClass({
  isNodeMaterialAsset: true,
  nodeMaterialDisplayName: 'Dynamic UV (Triplanar)',
  nodeMaterialGroup: 'Game Materials',
})
export class DynamicUVNodeMaterialAsset extends ENGINE.NodeMaterialAsset(MeshStandardNodeMaterial) {

  @ENGINE.property({ type: 'texturePath', description: 'Base color texture' })
    mapPath: TexturePath = '@project/assets/textures/T_Grid_10x10_Grey.png';

  @ENGINE.property({ type: 'number', min: 0.01, max: 20.0, step: 0.01, description: 'Texture scale in world units' })
    scale = 1.0;

  @ENGINE.property({ type: 'color', description: 'Tint color' })
  override color = new THREE.Color(1.0, 1.0, 1.0);

  @ENGINE.property({ type: 'number', min: 0, max: 1, step: 0.01, description: 'Roughness' })
  override roughness = 0.8;

  @ENGINE.property({ type: 'number', min: 0, max: 1, step: 0.01, description: 'Metalness' })
  override metalness = 0.0;

  private _gridTexture: ENGINE.UrlTexture | null = null;
  private _disposed = false;

  constructor() {
    super();
    this.rebuild();
  }

  private _syncGridTexture(): ENGINE.UrlTexture | null {
    const url = this.coerceTexturePath(this.mapPath);
    if (!url) {
      this._gridTexture?.dispose();
      this._gridTexture = null;
      return null;
    }

    if (!this._gridTexture) {
      this._gridTexture = new ENGINE.UrlTexture({
        url,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.RepeatWrapping,
        colorSpace: THREE.SRGBColorSpace,
      });
    } else if (this._gridTexture.url !== url) {
      this._gridTexture.url = url;
    }

    this._gridTexture.wrapS = THREE.RepeatWrapping;
    this._gridTexture.wrapT = THREE.RepeatWrapping;
    this._gridTexture.needsUpdate = true;
    return this._gridTexture;
  }

  override rebuild(): void {
    if (this._disposed) return;

    try {
      this.applyCommonMaterialState();

      const safeScale = this.clampFiniteNumber(this.scale, 0.01, 20, 1.0);
      const safeRoughness = this.clampFiniteNumber(this.roughness, 0, 1, 0.8);
      const safeMetalness = this.clampFiniteNumber(this.metalness, 0, 1, 0.0);
      this.scale = safeScale;
      this.roughness = safeRoughness;
      this.metalness = safeMetalness;

      const tex = this._syncGridTexture();

      if (tex) {
        const s = TSL.float(safeScale);

        // Project world-position onto the three cardinal planes, scaled.
        const uvXZ = TSL.positionWorld.xz.mul(s).toVar('triUVXZ'); // top/bottom faces
        const uvXY = TSL.positionWorld.xy.mul(s).toVar('triUVXY'); // front/back faces
        const uvYZ = TSL.positionWorld.yz.mul(s).toVar('triUVYZ'); // left/right faces

        const sampleXZ = TSL.texture(tex, uvXZ);
        const sampleXY = TSL.texture(tex, uvXY);
        const sampleYZ = TSL.texture(tex, uvYZ);

        // Blend weights from the absolute world normal, normalised.
        const absNormal = TSL.abs(TSL.normalWorld).toVar('triBlend');
        const bSum = absNormal.x.add(absNormal.y).add(absNormal.z).add(TSL.float(0.0001));
        const bx = absNormal.x.div(bSum); // weight for YZ plane (X-facing)
        const by = absNormal.y.div(bSum); // weight for XZ plane (Y-facing)
        const bz = absNormal.z.div(bSum); // weight for XY plane (Z-facing)

        const blended = sampleYZ.mul(bx).add(sampleXZ.mul(by)).add(sampleXY.mul(bz));
        this.colorNode = blended.mul(TSL.color(this.color));
      } else {
        this.colorNode = TSL.color(this.color);
      }

      this.roughnessNode = TSL.float(safeRoughness);
      this.metalnessNode = TSL.float(safeMetalness);
      this.needsUpdate = true;
    } catch (error) {
      console.error('[DynamicUVNodeMaterialAsset] rebuild failed', error);
      this.colorNode = TSL.vec3(1, 0, 1);
      this.needsUpdate = true;
    }
  }

  public serialize(dumper: ENGINE.IDumper): void {
    this.serializeAuthoredFields(dumper);
  }

  public static staticDeserialize(_data: unknown, loader: ENGINE.ILoader): DynamicUVNodeMaterialAsset {
    const instance = new DynamicUVNodeMaterialAsset();
    DynamicUVNodeMaterialAsset.loadAuthoredFields(instance, loader);
    instance.rebuild();
    return instance;
  }

  public override dispose(): void {
    this._disposed = true;
    this._gridTexture?.dispose();
    this._gridTexture = null;
    super.dispose();
  }
}

ENGINE.registerSpecialization({
  cls: DynamicUVNodeMaterialAsset,
  serializeFn: (obj, dumper) => (obj as DynamicUVNodeMaterialAsset).serialize(dumper),
  staticDeserializeFn: (data, loader) => DynamicUVNodeMaterialAsset.staticDeserialize(data, loader),
  cdo: new DynamicUVNodeMaterialAsset(),
});
