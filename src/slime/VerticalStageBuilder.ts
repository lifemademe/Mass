import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import {
  MomentumSwitchNode,
  PrototypeBlockNode,
  PrototypeExitNode,
  SlimeAnchorNode,
} from './SlimeWorldNodes.js';

const BASE_X = 80;

function visual(
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

function vine(name: string, points: THREE.Vector3[], radius: number): ENGINE.MeshNode {
  return visual(
    name,
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 30, radius, 8, false),
    new THREE.MeshStandardMaterial({
      color: 0x376c42,
      emissive: 0x0b2e13,
      emissiveIntensity: 1.25,
      roughness: 0.82,
    }),
    new THREE.Vector3(),
  );
}

export class VerticalStageBuilder {
  public readonly spawnPosition = new THREE.Vector3(BASE_X, 0.72, 0);

  public build(): ENGINE.SceneNode[] {
    const nodes: ENGINE.SceneNode[] = [];
    const add = <T extends ENGINE.SceneNode>(node: T): T => {
      nodes.push(node);
      return node;
    };
    const block = (name: string, x: number, y: number, width: number, height: number): void => {
      add(PrototypeBlockNode.create({
        name,
        position: new THREE.Vector3(x, y, 0),
        scale: new THREE.Vector3(width, height, 3),
      }));
    };
    const ledgeEdgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x789378,
      emissive: 0x214e30,
      emissiveIntensity: 1.15,
      roughness: 0.82,
    });
    const ledge = (name: string, x: number, y: number, width: number, height: number): void => {
      block(name, x, y, width, height);
      add(visual(
        `${name} Moss Edge`,
        new THREE.BoxGeometry(1, 1, 1),
        ledgeEdgeMaterial,
        new THREE.Vector3(x, y + height * 0.5 + 0.055, 1.56),
        new THREE.Vector3(width * 0.96, 0.11, 0.12),
      ));
    };

    ledge('Living Shaft Floor', BASE_X, -0.5, 22, 1);
    block('Left Shaft Boundary', BASE_X - 10.75, 20, 0.5, 40);
    block('Right Shaft Boundary', BASE_X + 10.75, 20, 0.5, 40);
    ledge('Left Rest Ledge I', BASE_X - 7.6, 7.2, 3.4, 0.7);
    ledge('Right Rest Ledge I', BASE_X + 7.6, 14.1, 3.4, 0.7);
    ledge('Left Rest Ledge II', BASE_X - 7.6, 21.1, 3.4, 0.7);
    ledge('Right Rest Ledge II', BASE_X + 7.6, 28.2, 3.4, 0.7);
    ledge('Canopy Crown', BASE_X, 35.5, 10, 1);

    const anchorSpecs: Array<[string, number, number, number, boolean]> = [
      ['Root Growth', BASE_X, 5.1, 4.1, false],
      ['Left Momentum Growth', BASE_X - 5.2, 11.1, 4.2, false],
      ['Switch Sling Growth', BASE_X + 1.6, 14.6, 2.5, false],
      ['Dormant Right Growth', BASE_X + 3.8, 18.5, 4.2, true],
      ['Dormant Upper Left Growth', BASE_X - 3.6, 25, 4.15, true],
      ['Dormant Upper Right Growth', BASE_X + 3.6, 32, 4.05, true],
    ];
    for (const [name, x, y, tetherLength, dormant] of anchorSpecs) {
      const anchor = SlimeAnchorNode.create({ name, position: new THREE.Vector3(x, y, 0) });
      anchor.activationRadius = 11;
      anchor.preferredTetherLength = tetherLength;
      anchor.startsDormant = dormant;
      add(anchor);
      if (!dormant) {
        add(ENGINE.PointLightNode.create({
          name: `${name} Glow`,
          color: 0x7cff8d,
          intensity: 2.8,
          distance: 7,
          decay: 2,
          position: new THREE.Vector3(x, y, 1.8),
        }));
      }
    }

    block('Momentum Wall', BASE_X + 9.25, 12.5, 0.8, 5.2);
    const momentumSwitch = MomentumSwitchNode.create({
      name: 'Mass Momentum Switch',
      position: new THREE.Vector3(BASE_X + 8.72, 12.35, 0),
    });
    momentumSwitch.minimumMass = 120;
    momentumSwitch.minimumImpactSpeed = 9;
    momentumSwitch.requiredMomentum = 1200;
    momentumSwitch.impactDirectionX = 1;
    add(momentumSwitch);

    const exit = PrototypeExitNode.create({
      name: 'Canopy Exit',
      position: new THREE.Vector3(BASE_X, 37.1, 0),
    });
    exit.requiredMass = 130;
    exit.completesGame = true;
    add(exit);

    const backdropMaterial = new THREE.MeshStandardMaterial({
      color: 0x030b08,
      emissive: 0x06150e,
      roughness: 1,
    });
    add(visual(
      'Living Shaft Backdrop',
      new THREE.BoxGeometry(1, 1, 1),
      backdropMaterial,
      new THREE.Vector3(BASE_X, 18, -3.4),
      new THREE.Vector3(23, 39, 1),
    ));

    const archMaterial = new THREE.MeshStandardMaterial({
      color: 0x0b1812,
      emissive: 0x081c12,
      roughness: 0.98,
    });
    for (let level = 0; level < 5; level += 1) {
      add(visual(
        `Shaft Arch ${level + 1}`,
        new THREE.TorusGeometry(8.7, 0.5, 9, 34, Math.PI),
        archMaterial,
        new THREE.Vector3(BASE_X, 4.8 + level * 7.15, -2.65),
      ));
    }

    add(vine('Left Climbing Root', [
      new THREE.Vector3(BASE_X - 9.5, 0, -1.2),
      new THREE.Vector3(BASE_X - 8.1, 9, -1.1),
      new THREE.Vector3(BASE_X - 9.2, 18, -1),
      new THREE.Vector3(BASE_X - 7.7, 28, -0.9),
      new THREE.Vector3(BASE_X - 8.8, 38, -0.8),
    ], 0.16));
    add(vine('Right Climbing Root', [
      new THREE.Vector3(BASE_X + 9.3, 0, -1.25),
      new THREE.Vector3(BASE_X + 8.2, 8, -1.15),
      new THREE.Vector3(BASE_X + 9.2, 17, -1.05),
      new THREE.Vector3(BASE_X + 7.9, 27, -0.95),
      new THREE.Vector3(BASE_X + 8.8, 38, -0.85),
    ], 0.15));

    const crownLight = ENGINE.PointLightNode.create({
      name: 'Canopy Crown Light',
      color: 0xc7ff9b,
      intensity: 5,
      distance: 13,
      decay: 1.6,
      position: new THREE.Vector3(BASE_X, 37, 2.5),
    });
    add(crownLight);

    return nodes;
  }
}
