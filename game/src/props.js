// Street furniture and greenery: the palms down every pavement, the lamp posts along the
// kerbs, and the clutter left on the roofs. All of it instanced so the city stays cheap.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, CITY_HALF, BLOCK_SIZE, COLORS, blockCenter, roadCenter } from './config.js';
import { range } from './rng.js';

function makeInstanced(geometry, material, transforms) {
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  const dummy = new THREE.Object3D();
  transforms.forEach((transform, index) => {
    dummy.position.set(transform.x, transform.y, transform.z);
    dummy.rotation.set(transform.rotationX ?? 0, transform.rotationY ?? 0, transform.rotationZ ?? 0);
    dummy.scale.set(transform.scaleX ?? 1, transform.scaleY ?? 1, transform.scaleZ ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Palms line the pavements, a couple of metres in from the kerb. */
export function plantPalms(parent, random, buildings) {
  const trunkGeometry = new THREE.CylinderGeometry(0.17, 0.36, 8.4, 7);
  trunkGeometry.translate(0, 4.2, 0);

  // Three frond shapes with different droop, so a crown is not a pinwheel.
  const frondGeometries = [0.05, 0.2, 0.36].map((droop) => {
    const geometry = new THREE.ConeGeometry(0.7, 5.0, 4, 1, false);
    geometry.rotateX(Math.PI / 2 + droop);
    geometry.scale(1, 0.38, 1);
    geometry.translate(0, 0.32, 2.15);
    return geometry;
  });
  const frondBatches = [[], [], []];

  const trunks = [];
  const crowns = [];
  const edge = BLOCK_SIZE / 2 - 2.4;
  const crowded = (x, z) => buildings.some((building) => (
    Math.abs(x - building.x) < building.width / 2 + 1.4 && Math.abs(z - building.z) < building.depth / 2 + 1.4
  ));

  for (let blockX = 0; blockX < CITY.cells; blockX += 1) {
    for (let blockZ = 0; blockZ < CITY.cells; blockZ += 1) {
      const centreX = blockCenter(blockX);
      const centreZ = blockCenter(blockZ);
      const spots = [];
      for (let step = -2; step <= 2; step += 1) {
        spots.push({ x: centreX + step * 17, z: centreZ - edge });
        spots.push({ x: centreX + step * 17, z: centreZ + edge });
        spots.push({ x: centreX - edge, z: centreZ + step * 17 });
        spots.push({ x: centreX + edge, z: centreZ + step * 17 });
      }
      for (const spot of spots) {
        if (random() < 0.42) continue;
        if (crowded(spot.x, spot.z)) continue;
        const lean = range(random, -0.06, 0.06);
        const height = range(random, 0.82, 1.22);
        const crown = 8.4 * height;
        trunks.push({
          x: spot.x, y: 0.16, z: spot.z,
          rotationX: lean, rotationZ: range(random, -0.05, 0.05),
          scaleX: 1, scaleY: height, scaleZ: 1,
        });
        crowns.push({ x: spot.x, y: crown + 0.26, z: spot.z });
        const spin = range(random, 0, Math.PI);
        for (let frond = 0; frond < 10; frond += 1) {
          const batch = frond % 3;
          frondBatches[batch].push({
            x: spot.x, y: crown + 0.16, z: spot.z,
            rotationY: spin + (frond / 10) * Math.PI * 2 + range(random, -0.12, 0.12),
            rotationZ: range(random, -0.14, 0.14),
            scaleX: 1.0, scaleY: 1.0, scaleZ: range(random, 0.72, 1.2),
          });
        }
      }
    }
  }

  const trunkMesh = makeInstanced(trunkGeometry, new THREE.MeshStandardMaterial({ color: COLORS.palmTrunk, roughness: 0.95 }), trunks);
  parent.add(trunkMesh);

  const leafMaterial = new THREE.MeshStandardMaterial({ color: COLORS.palmLeaf, roughness: 0.72, side: THREE.DoubleSide });
  frondGeometries.forEach((geometry, index) => {
    parent.add(makeInstanced(geometry, leafMaterial, frondBatches[index]));
  });

  const crownMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.34, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x7a5c3c, roughness: 0.9 }),
    crowns.length,
  );
  const dummy = new THREE.Object3D();
  crowns.forEach((crown, index) => {
    dummy.position.set(crown.x, crown.y, crown.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    crownMesh.setMatrixAt(index, dummy.matrix);
  });
  parent.add(crownMesh);
}


/** Cars left at the kerb: a few per street, so the boulevards are not bare. */
export function parkCars(parent, random, colliders) {
  const PAINTS = [0xe8e4d8, 0x2f4a63, 0xc9382f, 0x1f6b5e, 0xd7a24a, 0x8e93a0, 0x5b3a54, 0xf0f0ea];
  const spots = [];
  const nearJunction = (value) => {
    for (let index = 0; index <= CITY.cells; index += 1) {
      if (Math.abs(value - roadCenter(index)) < CITY.roadWidth / 2 + 8) return true;
    }
    return false;
  };

  for (let index = 0; index <= CITY.cells; index += 1) {
    const centre = roadCenter(index);
    for (let along = -CITY_HALF + 22; along < CITY_HALF - 22; along += 24) {
      if (random() < 0.38) continue;
      if (nearJunction(along)) continue;
      const side = random() < 0.5 ? -1 : 1;
      const offset = side * (CITY.roadWidth / 2 - 2.3);
      spots.push({
        x: along, z: centre + offset,
        heading: side > 0 ? Math.PI / 2 : -Math.PI / 2,
        colour: PAINTS[Math.floor(random() * PAINTS.length)],
      });
      spots.push({
        x: centre + offset, z: along,
        heading: side > 0 ? Math.PI : 0,
        colour: PAINTS[Math.floor(random() * PAINTS.length)],
      });
    }
  }

  const bodyGeometry = new THREE.BoxGeometry(1.95, 0.62, 4.4);
  const cabinGeometry = new THREE.BoxGeometry(1.72, 0.5, 2.05);
  const wheelGeometry = new THREE.CylinderGeometry(0.44, 0.44, 0.3, 10);
  wheelGeometry.rotateZ(Math.PI / 2);
  const skirtGeometry = new THREE.BoxGeometry(1.85, 0.28, 4.3);

  const bodyMesh = new THREE.InstancedMesh(bodyGeometry, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 }), spots.length);
  const cabinMesh = new THREE.InstancedMesh(cabinGeometry, new THREE.MeshStandardMaterial({ color: 0x25343d, roughness: 0.15, metalness: 0.6 }), spots.length);
  const skirtMesh = new THREE.InstancedMesh(skirtGeometry, new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.8 }), spots.length);
  const wheelMesh = new THREE.InstancedMesh(wheelGeometry, new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.95 }), spots.length * 4);

  const dummy = new THREE.Object3D();
  const colour = new THREE.Color();
  spots.forEach((spot, index) => {
    const sin = Math.sin(spot.heading);
    const cos = Math.cos(spot.heading);
    const place = (mesh, offsetX, offsetY, offsetZ, slot) => {
      dummy.position.set(spot.x + offsetX * cos + offsetZ * sin, offsetY, spot.z - offsetX * sin + offsetZ * cos);
      dummy.rotation.set(0, spot.heading, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(slot, dummy.matrix);
    };
    place(bodyMesh, 0, 0.64, 0, index);
    place(skirtMesh, 0, 0.36, 0, index);
    place(cabinMesh, 0, 1.14, -0.32, index);
    bodyMesh.setColorAt(index, colour.setHex(spot.colour));
    place(wheelMesh, -0.92, 0.44, 1.4, index * 4);
    place(wheelMesh, 0.92, 0.44, 1.4, index * 4 + 1);
    place(wheelMesh, -0.92, 0.44, -1.4, index * 4 + 2);
    place(wheelMesh, 0.92, 0.44, -1.4, index * 4 + 3);

    const alongX = Math.abs(sin) > 0.5;
    const halfLength = alongX ? 2.4 : 1.1;
    const halfWidth = alongX ? 1.1 : 2.4;
    colliders.push({
      minX: spot.x - halfLength, maxX: spot.x + halfLength,
      minZ: spot.z - halfWidth, maxZ: spot.z + halfWidth,
    });
  });

  bodyMesh.instanceColor.needsUpdate = true;
  for (const mesh of [bodyMesh, cabinMesh, skirtMesh, wheelMesh]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
}

/** Lamp posts every few car lengths along both kerbs of every street. */
export function lightStreets(parent) {
  const poles = [];
  const arms = [];
  const lamps = [];

  for (let index = 0; index <= CITY.cells; index += 1) {
    const centre = roadCenter(index);
    for (let along = -CITY_HALF + 14; along < CITY_HALF; along += 34) {
      for (const side of [-1, 1]) {
        const offset = side * (CITY.roadWidth / 2 - 1.0);
        poles.push({ x: along, y: 0, z: centre + offset });
        poles.push({ x: centre + offset, y: 0, z: along });
        arms.push({ x: along, y: 7.3, z: centre + offset - side * 1.3, rotationY: Math.PI / 2 });
        arms.push({ x: centre + offset - side * 1.3, y: 7.3, z: along, rotationY: 0 });
        lamps.push({ x: along, y: 7.1, z: centre + offset - side * 2.5 });
        lamps.push({ x: centre + offset - side * 2.5, y: 7.1, z: along });
      }
    }
  }

  const poleMesh = makeInstanced(
    new THREE.CylinderGeometry(0.11, 0.16, 7.4, 6).translate(0, 3.7, 0),
    new THREE.MeshStandardMaterial({ color: 0x4a4f52, roughness: 0.6, metalness: 0.5 }),
    poles,
  );
  const armMesh = makeInstanced(
    new THREE.BoxGeometry(2.8, 0.12, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x4a4f52, roughness: 0.6, metalness: 0.5 }),
    arms,
  );
  const lampMesh = makeInstanced(
    new THREE.BoxGeometry(0.7, 0.16, 0.36),
    new THREE.MeshStandardMaterial({ color: 0xfff3d2, emissive: 0xffd9a0, emissiveIntensity: 0.5, roughness: 0.5 }),
    lamps,
  );
  parent.add(poleMesh);
  parent.add(armMesh);
  parent.add(lampMesh);
}

/** Benches, planters, news kiosks and a bus shelter at the corners, so the pavements are lived in. */
export function dressCorners(parent, random, colliders) {
  const benchSeat = [];
  const benchBack = [];
  const planters = [];
  const shrubs = [];
  const kiosks = [];
  const shelterGlass = [];
  const shelterRoof = [];

  const inset = BLOCK_SIZE / 2 - 2.2;
  for (let blockX = 0; blockX < CITY.cells; blockX += 1) {
    for (let blockZ = 0; blockZ < CITY.cells; blockZ += 1) {
      const centreX = blockCenter(blockX);
      const centreZ = blockCenter(blockZ);
      for (const cornerX of [-1, 1]) {
        for (const cornerZ of [-1, 1]) {
          const x = centreX + cornerX * (inset - 3.4);
          const z = centreZ + cornerZ * (inset - 3.4);
          const turn = cornerX > 0 ? Math.PI / 2 : -Math.PI / 2;
          const roll = random();
          if (roll < 0.42) {
            benchSeat.push({ x, y: 0.62, z, rotationY: turn });
            benchBack.push({ x: x + cornerX * 0.32, y: 0.98, z, rotationY: turn });
          } else if (roll < 0.75) {
            planters.push({ x, y: 0.42, z });
            shrubs.push({ x, y: 1.05, z, scaleY: range(random, 0.8, 1.3) });
          } else {
            kiosks.push({ x, y: 0.85, z, rotationY: turn });
          }
        }
      }
      // A bus shelter halfway along the north kerb of every block.
      const shelterX = centreX + range(random, -12, 12);
      const shelterZ = centreZ - BLOCK_SIZE / 2 + 1.6;
      shelterRoof.push({ x: shelterX, y: 2.65, z: shelterZ });
      shelterGlass.push({ x: shelterX, y: 1.35, z: shelterZ - 0.55, rotationY: 0 });
    }
  }

  parent.add(makeInstanced(new THREE.BoxGeometry(1.9, 0.12, 0.62), new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 }), benchSeat));
  parent.add(makeInstanced(new THREE.BoxGeometry(1.9, 0.52, 0.1), new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 }), benchBack));
  parent.add(makeInstanced(new THREE.CylinderGeometry(0.72, 0.62, 0.84, 8), new THREE.MeshStandardMaterial({ color: 0xb0a89a, roughness: 0.95 }), planters));
  parent.add(makeInstanced(new THREE.SphereGeometry(0.82, 8, 6), new THREE.MeshStandardMaterial({ color: 0x4a7a3e, roughness: 1 }), shrubs));
  parent.add(makeInstanced(new THREE.BoxGeometry(1.5, 1.7, 1.1), new THREE.MeshStandardMaterial({ color: 0x2f5b6b, roughness: 0.6, metalness: 0.3 }), kiosks));
  parent.add(makeInstanced(new THREE.BoxGeometry(3.4, 0.16, 1.6), new THREE.MeshStandardMaterial({ color: 0x3a4a52, roughness: 0.5, metalness: 0.4 }), shelterRoof));
  parent.add(makeInstanced(
    new THREE.BoxGeometry(3.1, 1.9, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x9fc6cf, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.42 }),
    shelterGlass,
  ));

  for (const kiosk of kiosks) {
    colliders.push({ minX: kiosk.x - 0.9, maxX: kiosk.x + 0.9, minZ: kiosk.z - 0.7, maxZ: kiosk.z + 0.7 });
  }
}

/** Water tanks, air units, aerials, parapets, stair bulkheads and the odd rooftop pool: no two roofs alike. */
export function dressRoofs(parent, random, buildings) {
  const units = [];
  const tanks = [];
  const aerials = [];
  const parapets = [];
  const bulkheads = [];
  const pools = [];
  const dishes = [];
  const pergolas = [];

  for (const building of buildings) {
    if (building.height < 10) continue;
    const roofWidth = building.roofWidth ?? building.width;
    const roofDepth = building.roofDepth ?? building.depth;
    const count = 1 + Math.floor(random() * 3);
    for (let index = 0; index < count; index += 1) {
      const x = building.x + range(random, -roofWidth / 2 + 2, roofWidth / 2 - 2);
      const z = building.z + range(random, -roofDepth / 2 + 2, roofDepth / 2 - 2);
      if (random() < 0.6) {
        units.push({ x, y: building.top + 0.5, z, rotationY: range(random, 0, Math.PI) });
      } else {
        tanks.push({ x, y: building.top + 1.2, z, rotationY: range(random, 0, Math.PI) });
      }
    }
    if (random() < 0.5) {
      aerials.push({
        x: building.x + range(random, -2, 2),
        y: building.top + 2.4,
        z: building.z + range(random, -2, 2),
      });
    }

    // A parapet around the roof edge: the thing that makes a block read as a building.
    const rise = range(random, 0.55, 1.3);
    const thickness = 0.34;
    const edgeX = roofWidth / 2 - thickness / 2;
    const edgeZ = roofDepth / 2 - thickness / 2;
    parapets.push(
      { x: building.x, y: building.top + rise / 2, z: building.z + edgeZ, scaleX: roofWidth, scaleY: rise, scaleZ: thickness },
      { x: building.x, y: building.top + rise / 2, z: building.z - edgeZ, scaleX: roofWidth, scaleY: rise, scaleZ: thickness },
      { x: building.x + edgeX, y: building.top + rise / 2, z: building.z, scaleX: thickness, scaleY: rise, scaleZ: roofDepth },
      { x: building.x - edgeX, y: building.top + rise / 2, z: building.z, scaleX: thickness, scaleY: rise, scaleZ: roofDepth },
    );

    // The stair head, pushed into one corner.
    if (building.height > 16 && random() < 0.72) {
      const bulkWidth = range(random, 2.6, 4.2);
      const bulkDepth = range(random, 2.4, 3.6);
      const sideX = random() < 0.5 ? -1 : 1;
      const sideZ = random() < 0.5 ? -1 : 1;
      bulkheads.push({
        x: building.x + sideX * (roofWidth / 2 - bulkWidth / 2 - 1.4),
        y: building.top + 1.35,
        z: building.z + sideZ * (roofDepth / 2 - bulkDepth / 2 - 1.4),
        scaleX: bulkWidth, scaleY: 2.7, scaleZ: bulkDepth,
        rotationY: range(random, -0.05, 0.05),
      });
    }

    // Rooftop pools and sun decks on the low hotels along the waterfront.
    if (building.height > 24 && building.height < 52 && random() < 0.16) {
      pools.push({
        x: building.x + range(random, -1.5, 1.5),
        y: building.top + 0.35,
        z: building.z + range(random, -1.5, 1.5),
        scaleX: roofWidth * 0.46, scaleY: 0.5, scaleZ: roofDepth * 0.38,
      });
      pergolas.push({
        x: building.x + roofWidth * 0.28,
        y: building.top + 1.5,
        z: building.z - roofDepth * 0.28,
        rotationY: range(random, 0, Math.PI / 2),
      });
    }

    if (building.height > 18 && random() < 0.34) {
      dishes.push({
        x: building.x + range(random, -roofWidth / 3, roofWidth / 3),
        y: building.top + 1.0,
        z: building.z + range(random, -roofDepth / 3, roofDepth / 3),
        rotationY: range(random, 0, Math.PI * 2),
        scaleY: range(random, 0.7, 1.25),
      });
    }
  }

  const unitMesh = makeInstanced(
    new THREE.BoxGeometry(2.4, 1.0, 1.7),
    new THREE.MeshStandardMaterial({ color: 0xb9c0c2, roughness: 0.75, metalness: 0.3 }),
    units,
  );
  const tankMesh = makeInstanced(
    new THREE.CylinderGeometry(1.15, 1.15, 2.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x9aa3a6, roughness: 0.6, metalness: 0.35 }),
    tanks,
  );
  const aerialMesh = makeInstanced(
    new THREE.CylinderGeometry(0.05, 0.05, 4.8, 4),
    new THREE.MeshStandardMaterial({ color: 0x7d8487, roughness: 0.5, metalness: 0.6 }),
    aerials,
  );
  const parapetMesh = makeInstanced(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xd6cbb6, roughness: 0.92 }),
    parapets,
  );
  const bulkheadMesh = makeInstanced(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xbfae94, roughness: 0.88 }),
    bulkheads,
  );
  const poolMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x3fa9c4, roughness: 0.08, metalness: 0.35, emissive: 0x0d4152, emissiveIntensity: 0.5 }),
    pools.length,
  );
  const dummy = new THREE.Object3D();
  pools.forEach((pool, index) => {
    dummy.position.set(pool.x, pool.y, pool.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(pool.scaleX, pool.scaleY, pool.scaleZ);
    dummy.updateMatrix();
    poolMesh.setMatrixAt(index, dummy.matrix);
  });
  const dishMesh = makeInstanced(
    new THREE.ConeGeometry(0.75, 0.42, 10, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe6e3da, roughness: 0.7, side: THREE.DoubleSide }),
    dishes,
  );
  const pergolaMesh = makeInstanced(
    new THREE.BoxGeometry(3.2, 0.16, 2.4),
    new THREE.MeshStandardMaterial({ color: 0xf1e6cd, roughness: 0.85 }),
    pergolas,
  );

  for (const mesh of [unitMesh, tankMesh, aerialMesh, parapetMesh, bulkheadMesh, poolMesh, dishMesh, pergolaMesh]) {
    parent.add(mesh);
  }
}
