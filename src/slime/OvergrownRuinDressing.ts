import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

interface FungalCluster {
  name: string;
  position: THREE.Vector3;
  color: THREE.ColorRepresentation;
  emissive: THREE.ColorRepresentation;
  scale?: number;
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

function makeRoot(name: string, points: THREE.Vector3[], radius: number): ENGINE.MeshNode {
  return makeVisual(
    name,
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 28, radius, 7, false),
    new THREE.MeshStandardMaterial({
      color: 0x285438,
      emissive: 0x071b0d,
      roughness: 0.9,
      metalness: 0,
    }),
    new THREE.Vector3(),
  );
}

function addFungalCluster(nodes: ENGINE.SceneNode[], cluster: FungalCluster): void {
  const scale = cluster.scale ?? 1;
  const capMaterial = new THREE.MeshStandardMaterial({
    color: cluster.color,
    emissive: cluster.emissive,
    roughness: 0.55,
    metalness: 0,
  });
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x9eb8a1, roughness: 0.9, metalness: 0 });
  const offsets: Array<[number, number, number]> = [
    [-0.2, 0.13, 0.75],
    [0, 0.19, 1],
    [0.22, 0.11, 0.68],
  ];

  for (const [index, [offsetX, height, size]] of offsets.entries()) {
    const stemPosition = cluster.position.clone().add(new THREE.Vector3(offsetX * scale, height * 0.5 * scale, 0));
    nodes.push(makeVisual(
      `${cluster.name} Stem ${index + 1}`,
      new THREE.CylinderGeometry(0.035 * scale, 0.05 * scale, height * scale, 7),
      stemMaterial,
      stemPosition,
    ));
    const capPosition = cluster.position.clone().add(new THREE.Vector3(offsetX * scale, height * scale, 0));
    nodes.push(makeVisual(
      `${cluster.name} Cap ${index + 1}`,
      new THREE.SphereGeometry(0.14 * size * scale, 10, 7),
      capMaterial,
      capPosition,
      new THREE.Vector3(1.35, 0.55, 1),
    ));
  }
}

function addRubblePile(nodes: ENGINE.SceneNode[], name: string, position: THREE.Vector3, scale = 1): void {
  const material = new THREE.MeshStandardMaterial({
    color: 0x12221c,
    emissive: 0x020605,
    roughness: 1,
    metalness: 0,
  });
  const offsets: Array<[number, number, number, number]> = [
    [-0.34, 0.12, 0.34, -0.2],
    [0, 0.18, 0.46, 0.15],
    [0.38, 0.1, 0.3, 0.42],
    [0.12, 0.38, 0.27, -0.35],
  ];
  for (const [index, [offsetX, offsetY, size, rotation]] of offsets.entries()) {
    const stone = makeVisual(
      `${name} Stone ${index + 1}`,
      new THREE.DodecahedronGeometry(size * scale, 0),
      material,
      position.clone().add(new THREE.Vector3(offsetX * scale, offsetY * scale, 0)),
      new THREE.Vector3(1.25, 0.75, 0.8),
    );
    stone.rotation.z = rotation;
    nodes.push(stone);
  }
}

export function createOvergrownRuinDressing(): ENGINE.SceneNode[] {
  const nodes: ENGINE.SceneNode[] = [
    makeRoot('Start Wall Root', [
      new THREE.Vector3(-10.85, 8.5, -0.5),
      new THREE.Vector3(-10.5, 6.2, -0.48),
      new THREE.Vector3(-10.7, 3.6, -0.45),
      new THREE.Vector3(-9.5, 0.12, -0.4),
    ], 0.1),
    makeRoot('Gate Header Root', [
      new THREE.Vector3(14.4, 7.1, -0.5),
      new THREE.Vector3(14.1, 6, -0.46),
      new THREE.Vector3(14.7, 4.9, -0.42),
      new THREE.Vector3(14.35, 3.6, -0.38),
    ], 0.075),
    makeRoot('Reunion Hall Root', [
      new THREE.Vector3(19.2, 8.8, -0.65),
      new THREE.Vector3(20.1, 7, -0.58),
      new THREE.Vector3(19.6, 4.3, -0.5),
      new THREE.Vector3(21.2, 0.1, -0.4),
    ], 0.085),
    makeRoot('Exit Ledge Root', [
      new THREE.Vector3(31.4, 11.6, -0.6),
      new THREE.Vector3(30.4, 10.2, -0.54),
      new THREE.Vector3(30.8, 8.1, -0.48),
      new THREE.Vector3(29.8, 6.1, -0.42),
    ], 0.095),
  ];

  const clusters: FungalCluster[] = [
    { name: 'Start Fungi', position: new THREE.Vector3(-8.2, 0.08, -0.38), color: 0x76d88a, emissive: 0x163d20, scale: 0.9 },
    { name: 'Biomass Fungi', position: new THREE.Vector3(3.55, 0.08, -0.38), color: 0xffbd58, emissive: 0x5b2c08, scale: 1.05 },
    { name: 'Gate Fungi', position: new THREE.Vector3(11.8, 0.08, -0.38), color: 0x8be7a0, emissive: 0x194b26, scale: 0.85 },
    { name: 'Switch Fungi', position: new THREE.Vector3(17.75, 0.08, -0.38), color: 0xff775b, emissive: 0x57150b, scale: 0.95 },
    { name: 'Reunion Fungi', position: new THREE.Vector3(22.1, 0.08, -0.38), color: 0x6fd994, emissive: 0x123e28, scale: 0.9 },
    { name: 'Exit Fungi', position: new THREE.Vector3(28.1, 6.08, -0.38), color: 0xb19cff, emissive: 0x35236c, scale: 1.05 },
  ];
  for (const cluster of clusters) addFungalCluster(nodes, cluster);

  addRubblePile(nodes, 'Start Rubble', new THREE.Vector3(-9.6, 0.06, -0.75), 0.75);
  addRubblePile(nodes, 'Gate Rubble', new THREE.Vector3(12.8, 0.06, -0.75), 0.62);
  addRubblePile(nodes, 'Hall Rubble', new THREE.Vector3(20.1, 0.06, -0.75), 0.7);
  addRubblePile(nodes, 'Exit Rubble', new THREE.Vector3(30.2, 6.06, -0.75), 0.64);
  return nodes;
}
