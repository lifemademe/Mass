import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { createOvergrownRuinDressing } from './OvergrownRuinDressing.js';

const ASSETS = {
  fern: '@engine/assets/models/demo/SandboxAsset/Foliage/SM_SB_Fern01.glb',
  grass: '@engine/assets/models/demo/SandboxAsset/Foliage/SM_SB_GrassPatch.glb',
  growingPlant: '@engine/assets/models/demo/SandboxAsset/Foliage/SM_SB_Growing_Plant.glb',
  moss: '@engine/assets/models/demo/SandboxAsset/Foliage/SM_SB_Middle_Moss.glb',
  mushroomCluster: '@engine/assets/models/demo/LowPoly/SM_MushroomCluster01.glb',
  rock: '@engine/assets/models/demo/SandboxAsset/Rocks/SM_SB_Rock01.glb',
} as const;

const PALETTE = {
  void: 0x020605,
  ruinDeep: 0x07100e,
  ruin: 0x101d19,
  ruinEdge: 0x1b2d27,
  moss: 0x315d38,
  mossGlow: 0x6fca61,
  growth: 0x74f08a,
  spore: 0xb8ffc5,
  amber: 0xffb84f,
  violet: 0xa28cff,
} as const;

interface ModelDecoration {
  name: string;
  modelUrl: string;
  position: THREE.Vector3;
  scale: THREE.Vector3;
  rotationY?: number;
  material?: THREE.Material;
}

function makeMaterial(
  color: THREE.ColorRepresentation,
  roughness = 0.9,
  emissive: THREE.ColorRepresentation = 0x000000,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive, roughness, metalness: 0 });
}

function makeVisual(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: THREE.Vector3,
  scale = new THREE.Vector3(1, 1, 1),
): ENGINE.MeshNode {
  return ENGINE.MeshNode.create({
    name,
    geometry,
    material,
    position,
    scale,
    castShadow: false,
    receiveShadow: true,
    physicsOptions: { enabled: false },
  });
}

function makeVine(name: string, points: THREE.Vector3[], radius = 0.075): ENGINE.MeshNode {
  const curve = new THREE.CatmullRomCurve3(points);
  return makeVisual(
    name,
    new THREE.TubeGeometry(curve, 24, radius, 7, false),
    makeMaterial(PALETTE.mossGlow, 0.62, 0x143d18),
    new THREE.Vector3(),
  );
}

@ENGINE.GameClass()
export class OvergrownSporeNode extends ENGINE.MeshNode {
  private readonly origin = new THREE.Vector3();
  private phase = 0;
  private speed = 0.5;
  private elapsed = 0;

  public configure(origin: THREE.Vector3, phase: number, speed: number): void {
    this.origin.copy(origin);
    this.phase = phase;
    this.speed = speed;
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.elapsed += deltaTime;
    const time = this.elapsed * this.speed + this.phase;
    this.position.x = this.origin.x + Math.sin(time * 0.63) * 0.2;
    this.position.y = this.origin.y + Math.sin(time) * 0.28;
    const pulse = 0.72 + Math.sin(time * 1.7) * 0.2;
    this.scale.setScalar(pulse);
  }
}

export class OvergrownAtmosphereBuilder {
  private readonly nodes: ENGINE.SceneNode[] = [];

  public build(): ENGINE.SceneNode[] {
    this.addEnvironment();
    this.addLighting();
    this.addRuinBackdrop();
    this.addMossAndGrowth();
    this.addFoliage();
    this.add(...createOvergrownRuinDressing());
    this.addSpores();
    return this.nodes;
  }

  private add(...nodes: ENGINE.SceneNode[]): void {
    this.nodes.push(...nodes);
  }

  private addEnvironment(): void {
    this.add(ENGINE.SceneEnvironmentNode.create({
      name: 'Overgrown Gloom',
      sourceType: ENGINE.EnvironmentSourceType.Procedural,
      width: 96,
      height: 48,
      bottomColor: PALETTE.void,
      middleColor: PALETTE.ruinDeep,
      topColor: 0x173026,
      backgroundIntensity: 0.62,
      envMapIntensity: 0.5,
    }));
  }

  private addLighting(): void {
    this.add(ENGINE.HemisphereLightNode.create({
      name: 'Canopy Fill',
      color: 0x8dc8ad,
      groundColor: 0x050907,
      intensity: 0.3,
    }));

    const ceilingLight = ENGINE.DirectionalLightNode.create({
      name: 'Broken Ceiling Light',
      color: 0xc8ffe5,
      intensity: 0.65,
      castShadow: true,
      shadowMapSize: 2048,
      shadowNormalBias: 0.03,
      position: new THREE.Vector3(-6, 14, 8),
    });
    ceilingLight.rotation.set(-0.65, -0.45, -0.2);
    this.add(ceilingLight);

    const pools: Array<[string, THREE.ColorRepresentation, number, number, THREE.Vector3]> = [
      ['Pit Growth Glow', PALETTE.growth, 3, 8, new THREE.Vector3(0.5, 4.5, 2)],
      ['Biomass Glow', PALETTE.amber, 2.5, 5, new THREE.Vector3(4.6, 1.1, 2)],
      ['Switch Glow', 0xff684d, 2, 4, new THREE.Vector3(17, 1, 2)],
      ['High Growth Glow', PALETTE.growth, 4, 9, new THREE.Vector3(25, 8, 2)],
      ['Exit Glow', PALETTE.violet, 3.5, 6, new THREE.Vector3(29, 7, 2)],
    ];
    for (const [name, color, intensity, distance, position] of pools) {
      const light = ENGINE.PointLightNode.create({
        name: 'Atmosphere Light',
        color,
        intensity,
        distance,
        decay: 2,
        position,
      });
      light.name = name;
      this.add(light);
    }
  }

  private addRuinBackdrop(): void {
    const stone = makeMaterial(0x030805, 1, 0x050d09);
    const edge = makeMaterial(0x07100c, 1, 0x0b1e15);

    const slabs: Array<[string, THREE.Vector3, THREE.Vector3, THREE.Material]> = [
      ['Left Broken Pier', new THREE.Vector3(-9.7, 5.1, -2.8), new THREE.Vector3(2.4, 10.2, 1), stone],
      ['Pit Far Pier', new THREE.Vector3(2.2, 7.1, -3), new THREE.Vector3(2.2, 8.5, 1), stone],
      ['Gate Far Pier', new THREE.Vector3(13.8, 5.2, -3), new THREE.Vector3(2.5, 10.5, 1), stone],
      ['Hall Far Pier', new THREE.Vector3(21.2, 6.7, -3.1), new THREE.Vector3(2.1, 9.5, 1), stone],
      ['Exit Far Pier', new THREE.Vector3(30.8, 7.2, -2.8), new THREE.Vector3(2.5, 11.5, 1), stone],
      ['Left Fractured Beam', new THREE.Vector3(-5.8, 10.2, -2.7), new THREE.Vector3(7, 0.55, 1), edge],
      ['Hall Fractured Beam', new THREE.Vector3(17.6, 10.1, -2.8), new THREE.Vector3(7.2, 0.55, 1), edge],
    ];
    for (const [name, position, scale, material] of slabs) {
      this.add(makeVisual(name, new THREE.BoxGeometry(1, 1, 1), material, position, scale));
    }

    this.add(makeVisual(
      'Collapsed Arch',
      new THREE.TorusGeometry(3.2, 0.42, 10, 30, Math.PI),
      edge,
      new THREE.Vector3(7.2, 5.2, -2.45),
    ));
    this.add(makeVisual(
      'Exit Arch',
      new THREE.TorusGeometry(3.5, 0.48, 10, 32, Math.PI),
      edge,
      new THREE.Vector3(28.8, 7.2, -2.35),
    ));
  }

  private addMossAndGrowth(): void {
    const moss = makeMaterial(PALETTE.moss, 0.98, 0x071608);
    const growth = makeMaterial(PALETTE.growth, 0.52, 0x1e6127);
    const ledges: Array<[string, THREE.Vector3, THREE.Vector3]> = [
      ['Start Moss Lip', new THREE.Vector3(-6, 0.035, -0.15), new THREE.Vector3(9.8, 0.09, 2.7)],
      ['Biomass Moss Lip', new THREE.Vector3(5, 0.035, -0.15), new THREE.Vector3(5.8, 0.09, 2.7)],
      ['Gate Moss Lip', new THREE.Vector3(11, 0.035, -0.15), new THREE.Vector3(5.8, 0.09, 2.7)],
      ['Hall Moss Lip', new THREE.Vector3(20, 0.035, -0.15), new THREE.Vector3(11.8, 0.09, 2.7)],
      ['Exit Moss Lip', new THREE.Vector3(29, 6.035, -0.15), new THREE.Vector3(5.8, 0.09, 2.7)],
    ];
    for (const [name, position, scale] of ledges) {
      this.add(makeVisual(name, new THREE.BoxGeometry(1, 1, 1), moss, position, scale));
    }

    this.add(
      makeVine('Pit Growth Stem', [
        new THREE.Vector3(2.2, 10.2, -0.65),
        new THREE.Vector3(1.6, 8.1, -0.6),
        new THREE.Vector3(0.5, 4.5, -0.45),
      ], 0.11),
      makeVine('High Growth Stem', [
        new THREE.Vector3(27.8, 12.4, -0.7),
        new THREE.Vector3(26.5, 10.8, -0.62),
        new THREE.Vector3(25, 8, -0.45),
      ], 0.12),
      makeVine('Gate Wall Vine', [
        new THREE.Vector3(14.7, 10.1, -2.15),
        new THREE.Vector3(14.3, 7.7, -2.1),
        new THREE.Vector3(15.1, 5.3, -2),
        new THREE.Vector3(14.4, 2.9, -1.9),
      ]),
      makeVine('Exit Arch Vine', [
        new THREE.Vector3(30.6, 11.3, -1.95),
        new THREE.Vector3(29.7, 9.7, -1.9),
        new THREE.Vector3(30.2, 7.8, -1.85),
      ]),
    );

    const bulbs = [new THREE.Vector3(0.5, 4.5, -0.42), new THREE.Vector3(25, 8, -0.42)];
    for (const [index, position] of bulbs.entries()) {
      this.add(makeVisual(
        `Growth Heart ${index + 1}`,
        new THREE.IcosahedronGeometry(0.48, 2),
        growth,
        position,
        new THREE.Vector3(1, 1.12, 0.9),
      ));
    }
  }

  private addFoliage(): void {
    const silhouetteMaterial = makeMaterial(0x10241a, 0.98);
    const decorations: ModelDecoration[] = [
      { name: 'Fern Left', modelUrl: ASSETS.fern, position: new THREE.Vector3(-8, 0, -0.8), scale: new THREE.Vector3(1.1, 1.1, 1.1) },
      { name: 'Fern Pit', modelUrl: ASSETS.fern, position: new THREE.Vector3(-1.8, 0, -0.9), scale: new THREE.Vector3(0.7, 0.7, 0.7), rotationY: 2.4 },
      { name: 'Gate Moss', modelUrl: ASSETS.moss, position: new THREE.Vector3(10.4, 0.05, -0.85), scale: new THREE.Vector3(1.1, 1.1, 1.1) },
      { name: 'Fern Gate', modelUrl: ASSETS.fern, position: new THREE.Vector3(11.5, 0, -0.8), scale: new THREE.Vector3(0.85, 0.85, 0.85), rotationY: 1.2 },
      { name: 'Biomass Mushrooms', modelUrl: ASSETS.mushroomCluster, position: new THREE.Vector3(6.2, 0, -0.75), scale: new THREE.Vector3(0.9, 0.9, 0.9) },
      { name: 'Hall Grass', modelUrl: ASSETS.grass, position: new THREE.Vector3(18.6, 0, -0.9), scale: new THREE.Vector3(1.05, 1.05, 1.05) },
      { name: 'Hall Growing Plant', modelUrl: ASSETS.growingPlant, position: new THREE.Vector3(22.8, 0, -0.95), scale: new THREE.Vector3(1.15, 1.15, 1.15), rotationY: 2.2 },
      { name: 'Hall Rock', modelUrl: ASSETS.rock, position: new THREE.Vector3(24, 0, -1.1), scale: new THREE.Vector3(0.7, 0.7, 0.7), material: silhouetteMaterial },
      { name: 'Exit Mushrooms', modelUrl: ASSETS.mushroomCluster, position: new THREE.Vector3(27.5, 6, -0.75), scale: new THREE.Vector3(0.8, 0.8, 0.8) },
      { name: 'Exit Moss', modelUrl: ASSETS.moss, position: new THREE.Vector3(30.5, 6.05, -0.9), scale: new THREE.Vector3(1.15, 1.15, 1.15) },
    ];

    for (const decoration of decorations) {
      const model = ENGINE.ModelMeshNode.create({
        name: 'Overgrown Decoration',
        modelUrl: decoration.modelUrl,
        material: decoration.material,
        position: decoration.position,
        scale: decoration.scale,
        physicsOptions: { enabled: false },
        castShadow: true,
        receiveShadow: true,
      });
      model.name = decoration.name;
      model.rotation.y = decoration.rotationY ?? 0;
      this.add(model);
    }
  }

  private addSpores(): void {
    let seed = 4815;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const material = makeMaterial(PALETTE.spore, 0.3, 0x4b8f55);
    for (let index = 0; index < 22; index += 1) {
      const origin = new THREE.Vector3(-10 + random() * 42, 1.2 + random() * 10.5, -1.4 - random() * 1.2);
      const size = 0.035 + random() * 0.055;
      const node = OvergrownSporeNode.create({
        name: 'Drifting Spore',
        geometry: new THREE.SphereGeometry(size, 7, 5),
        material,
        position: origin.clone(),
        castShadow: false,
        physicsOptions: { enabled: false },
      });
      node.name = `Drifting Spore ${index + 1}`;
      node.configure(origin, random() * Math.PI * 2, 0.45 + random() * 0.5);
      this.add(node);
    }
  }
}
