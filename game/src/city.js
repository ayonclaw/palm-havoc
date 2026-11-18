// Marisol Bay itself: the asphalt, the pavements, the lane paint, the beach, the towers and the
// landmarks. buildCity() returns the group plus the collision boxes and spawn the rest of the
// game uses.
import * as THREE from '../vendor/three.module.min.js';
import {
  CITY, CITY_HALF, CITY_SPAN, BLOCK_SIZE, LOT_SIZE, OCEAN, COLORS, SUN,
  blockCenter, roadCenter,
} from './config.js';
import {
  createAsphalt, createPavement, createSand, createFacadeTextures,
  createStorefrontTextures, createSignTexture,
} from './textures.js';
import { ROOF_WORDS } from './shops.js';
import { buildWater } from './water.js';
import { range, chance, pick } from './rng.js';
import { plantPalms, lightStreets, dressRoofs, parkCars, dressCorners } from './props.js';
import { buildLandmarks } from './landmarks.js';

/** Raised surfaces the walker can stand on: pushed to by the pier and read by groundHeight. */
export const PLATFORMS = [];

/** Height of the ground at a point: a pier deck, a pavement, or the road between blocks. */
export function groundHeight(x, z) {
  for (let index = 0; index < PLATFORMS.length; index += 1) {
    const platform = PLATFORMS[index];
    if (x > platform.minX && x < platform.maxX && z > platform.minZ && z < platform.maxZ) return platform.y;
  }
  const blockX = Math.round((x + CITY_HALF) / CITY.pitch - 0.5);
  const blockZ = Math.round((z + CITY_HALF) / CITY.pitch - 0.5);
  if (blockX < 0 || blockZ < 0 || blockX >= CITY.cells || blockZ >= CITY.cells) return 0;
  const centreX = blockCenter(blockX);
  const centreZ = blockCenter(blockZ);
  if (Math.abs(x - centreX) < BLOCK_SIZE / 2 && Math.abs(z - centreZ) < BLOCK_SIZE / 2) return CITY.curbHeight;
  return 0;
}

/** Slide a circle out of every building footprint it overlaps; returns the corrected position. */
export function pushOutOfBoxes(boxes, x, z, radius) {
  let px = x;
  let pz = z;
  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index];
    const closestX = Math.max(box.minX, Math.min(px, box.maxX));
    const closestZ = Math.max(box.minZ, Math.min(pz, box.maxZ));
    const deltaX = px - closestX;
    const deltaZ = pz - closestZ;
    const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
    if (distanceSquared > radius * radius) continue;
    if (distanceSquared > 0.000001) {
      const distance = Math.sqrt(distanceSquared);
      const push = radius - distance;
      px += (deltaX / distance) * push;
      pz += (deltaZ / distance) * push;
    } else {
      const left = px - box.minX;
      const right = box.maxX - px;
      const back = pz - box.minZ;
      const front = box.maxZ - pz;
      const smallest = Math.min(left, right, back, front);
      if (smallest === left) px = box.minX - radius;
      else if (smallest === right) px = box.maxX + radius;
      else if (smallest === back) pz = box.minZ - radius;
      else pz = box.maxZ + radius;
    }
  }
  return { x: px, z: pz };
}

function buildGround(parent, surfaces) {
  // Dry land only: three aprons around the grid, so the bay has no tan floor showing through the
  // swell. The seaward side is left open for the water.
  const outskirtsMaterial = new THREE.MeshStandardMaterial({ color: COLORS.outskirt, roughness: 1 });
  const aprons = [
    { width: 4200, depth: 1800, x: 0, z: 1195 },
    { width: 1805, depth: 581, x: -1197, z: 4 },
    { width: 1805, depth: 581, x: 1197, z: 4 },
  ];
  for (const apron of aprons) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(apron.width, apron.depth), outskirtsMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(apron.x, -0.62, apron.z);
    mesh.receiveShadow = true;
    parent.add(mesh);
  }

  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_SPAN + 70, CITY_SPAN + 70),
    new THREE.MeshStandardMaterial({ map: surfaces.asphalt, roughness: 0.94, metalness: 0.02 }),
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.receiveShadow = true;
  parent.add(asphalt);
}

function buildBay(parent, random) {
  const depth = Math.abs(OCEAN.beachEnd - OCEAN.beachStart);
  const beach = new THREE.Mesh(
    new THREE.BoxGeometry(2400, 0.5, depth),
    new THREE.MeshStandardMaterial({ map: createSand(random), roughness: 1 }),
  );
  beach.position.set(0, -0.05, (OCEAN.beachStart + OCEAN.beachEnd) / 2);
  beach.receiveShadow = true;
  parent.add(beach);

  // Animated water: swell in the vertex shader, sun glitter in the fragment shader.
  const water = buildWater(parent);

  // A low sea wall separates the last row of blocks from the sand, with a gap at the pier.
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xe6ddca, roughness: 0.9 });
  for (const segment of [[-1200, 1200 + (roadCenter(3) - 12)], [roadCenter(3) + 26, 1200]]) {
    const width = segment[1] - segment[0];
    if (width <= 0) continue;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, 1.1, 3), wallMaterial);
    wall.position.set((segment[0] + segment[1]) / 2, 0.55, OCEAN.beachStart + 1.5);
    wall.castShadow = true;
    wall.receiveShadow = true;
    parent.add(wall);
  }
  return water;
}

/** Lane dashes down the middle of every street, and crosswalks at every crossing. */
function buildStreets(parent) {
  const paintMaterial = new THREE.MeshStandardMaterial({ color: COLORS.laneMark, roughness: 0.7 });
  const dashes = [];
  const stripeGeometry = new THREE.BoxGeometry(0.8, 0.02, 4.4);
  const crossings = [];

  const nearCrossing = (value) => {
    for (let index = 0; index <= CITY.cells; index += 1) {
      if (Math.abs(value - roadCenter(index)) < CITY.roadWidth / 2 + 6) return true;
    }
    return false;
  };

  for (let index = 0; index <= CITY.cells; index += 1) {
    const centre = roadCenter(index);
    for (let along = -CITY_HALF; along <= CITY_HALF; along += 9) {
      if (nearCrossing(along)) continue;
      dashes.push({ x: along, z: centre, turn: Math.PI / 2 });
      dashes.push({ x: centre, z: along, turn: 0 });
    }
  }

  for (let first = 0; first <= CITY.cells; first += 1) {
    for (let second = 0; second <= CITY.cells; second += 1) {
      const x = roadCenter(first);
      const z = roadCenter(second);
      for (const side of [-1, 1]) {
        for (let stripe = -4; stripe <= 4; stripe += 1) {
          crossings.push({ x: x + stripe * 2.0, z: z + side * 11.4, turn: 0 });
          crossings.push({ x: x + side * 11.4, z: z + stripe * 2.0, turn: Math.PI / 2 });
        }
      }
    }
  }

  const dashMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.34, 0.02, 4.2),
    paintMaterial,
    dashes.length,
  );
  const stripeMesh = new THREE.InstancedMesh(stripeGeometry, paintMaterial, crossings.length);
  const dummy = new THREE.Object3D();
  dashes.forEach((dash, index) => {
    dummy.position.set(dash.x, 0.03, dash.z);
    dummy.rotation.set(0, dash.turn, 0);
    dummy.updateMatrix();
    dashMesh.setMatrixAt(index, dummy.matrix);
  });
  crossings.forEach((stripe, index) => {
    dummy.position.set(stripe.x, 0.028, stripe.z);
    dummy.rotation.set(0, stripe.turn, 0);
    dummy.updateMatrix();
    stripeMesh.setMatrixAt(index, dummy.matrix);
  });
  dashMesh.frustumCulled = false;
  stripeMesh.frustumCulled = false;
  parent.add(dashMesh);
  parent.add(stripeMesh);
}

/** Which family suits a building of this height: glass and deco go up, brick and stone stay low. */
function pickVariant(random, surfaces, height) {
  const tall = height > 44;
  const low = height < 20;
  const wanted = tall
    ? (chance(random, 0.55) ? 'glass' : 'deco')
    : low
      ? pick(random, ['brick', 'brick', 'stone', 'deco'])
      : pick(random, ['deco', 'deco', 'stone', 'glass', 'brick']);
  const matches = [];
  surfaces.facades.forEach((entry, index) => {
    if (entry.family === wanted) matches.push(index);
  });
  return matches.length ? pick(random, matches) : 0;
}

function buildBlocks(parent, random, surfaces, colliders, buildings, reserved, staff) {
  const pavementMaterial = new THREE.MeshStandardMaterial({ map: surfaces.pavement, roughness: 0.9 });

  /** A shuffled deck, dealt one card at a time: no two neighbours draw the same name. */
  const dealer = (size) => {
    const order = [];
    for (let index = 0; index < size; index += 1) order.push(index);
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    let cursor = 0;
    return () => {
      const card = order[cursor % order.length];
      cursor += 1;
      return card;
    };
  };

  for (let blockX = 0; blockX < CITY.cells; blockX += 1) {
    for (let blockZ = 0; blockZ < CITY.cells; blockZ += 1) {
      const centreX = blockCenter(blockX);
      const centreZ = blockCenter(blockZ);

      // Each block is dealt its own deck of shopfronts and rooftop words.
      const shopCard = dealer(surfaces.storefronts.length);
      const roofCard = dealer(ROOF_WORDS.length);
      const nextShop = () => surfaces.storefronts[shopCard()];
      const nextRoofWord = () => ROOF_WORDS[roofCard()];

      const pavement = new THREE.Mesh(
        new THREE.BoxGeometry(BLOCK_SIZE, CITY.curbHeight, BLOCK_SIZE),
        pavementMaterial,
      );
      pavement.position.set(centreX, CITY.curbHeight / 2, centreZ);
      pavement.receiveShadow = true;
      pavement.castShadow = false;
      parent.add(pavement);

      const core = 1 - Math.max(Math.abs(blockX - 2), Math.abs(blockZ - 2)) / 2;
      const plot = (BLOCK_SIZE - CITY.sidewalkWidth * 2) / 2;

      for (let cornerX = 0; cornerX < 2; cornerX += 1) {
        for (let cornerZ = 0; cornerZ < 2; cornerZ += 1) {
          if (chance(random, 0.12)) continue;
          const plotX = centreX + (cornerX === 0 ? -plot / 2 : plot / 2);
          const plotZ = centreZ + (cornerZ === 0 ? -plot / 2 : plot / 2);
          const width = range(random, 17, plot - CITY.lotInset * 2);
          const depth = range(random, 17, plot - CITY.lotInset * 2);
          const height = Math.round(range(random, 8, 20) + core * range(random, 12, 58) + (random() < 0.08 ? 26 : 0));
          const x = plotX + range(random, -1.6, 1.6);
          const z = plotZ + range(random, -1.6, 1.6);
          const footprint = { minX: x - width / 2 - 2, maxX: x + width / 2 + 2, minZ: z - depth / 2 - 2, maxZ: z + depth / 2 + 2 };
          const clashes = [...reserved, ...staff].some((area) => !(
            footprint.maxX < area.minX || footprint.minX > area.maxX
            || footprint.maxZ < area.minZ || footprint.minZ > area.maxZ
          ));
          if (clashes) continue;

          addBuilding(parent, random, surfaces, buildings, {
            x, z, width, depth, height, blockX, blockZ, nextShop, nextRoofWord,
          });
          colliders.push({
            minX: x - width / 2 - 0.4,
            maxX: x + width / 2 + 0.4,
            minZ: z - depth / 2 - 0.4,
            maxZ: z + depth / 2 + 0.4,
          });
        }
      }
    }
  }
}

function addTower(parent, facade, x, z, width, depth, height, baseY, tint) {
  const texture = facade.map.clone();
  texture.needsUpdate = true;
  texture.repeat.set(Math.max(1, Math.round(width / 8)), Math.max(1, Math.round(height / 9)));
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      map: texture,
      color: tint,
      roughness: facade.family === 'glass' ? 0.26 : 0.72,
      metalness: facade.family === 'glass' ? 0.52 : 0.06,
    }),
  );
  tower.position.set(x, baseY + height / 2, z);
  tower.castShadow = true;
  tower.receiveShadow = true;
  parent.add(tower);
  return tower;
}

const ROOF_SIGN_LOOKS = [
  { background: '#18262c', border: '#ff7a4d', face: 'sans', weight: 900, tracking: 0.06 },
  { background: '#6d2a24', border: '#f7dfb8', face: 'serif', weight: 700, tracking: 0.12 },
  { background: '#1d3d47', border: '#9fd9e2', face: 'condensed', weight: 800, tracking: 0.2 },
  { background: '#2a2438', border: '#ffc871', face: 'mono', weight: 700, tracking: 0.08 },
  { background: '#20443c', border: '#f0dcae', face: 'grotesk', weight: 600, tracking: 0.22 },
];

function addBuilding(parent, random, surfaces, buildings, spec) {
  const { x, z, width, depth, height, nextShop, nextRoofWord } = spec;
  const variant = pickVariant(random, surfaces, height);
  const facade = surfaces.facades[variant];
  const base = CITY.curbHeight;
  const podiumHeight = Math.min(4.6, Math.max(3.2, height * 0.26));
  const towerHeight = height - podiumHeight;

  // A tint of its own, so no two blocks of the same palette are the same block.
  const tint = new THREE.Color(1, 1, 1).offsetHSL(
    range(random, -0.015, 0.015),
    range(random, -0.03, 0.02),
    range(random, -0.06, 0.05),
  );

  // Ground floor: a shop with a named fascia, or a plain stone base for the towers. A corner
  // building gets a different name on each street, the way a real corner does.
  if (height < 42 || chance(random, 0.55)) {
    const shop = nextShop ? nextShop() : surfaces.storefronts[0];
    const cornerShop = nextShop ? nextShop() : surfaces.storefronts[(surfaces.storefronts.indexOf(shop) + 1) % surfaces.storefronts.length];
    const frontMaterial = new THREE.MeshStandardMaterial({ map: shop.map, roughness: 0.42, metalness: 0.2 });
    const sideMaterial = new THREE.MeshStandardMaterial({ map: cornerShop.map, roughness: 0.42, metalness: 0.2 });
    const plinthMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2a27, roughness: 0.9 });
    const podium = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.9, podiumHeight, depth + 0.9),
      [frontMaterial, frontMaterial, plinthMaterial, plinthMaterial, sideMaterial, sideMaterial],
    );
    podium.position.set(x, base + podiumHeight / 2, z);
    podium.castShadow = true;
    podium.receiveShadow = true;
    parent.add(podium);

    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(width + 1.7, 0.3, depth + 1.7),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(shop.accent ?? facade.accent), roughness: 0.85 }),
    );
    awning.position.set(x, base + podiumHeight + 0.15, z);
    awning.castShadow = true;
    awning.receiveShadow = true;
    parent.add(awning);
    buildings.push({ x, z, width, depth, height: podiumHeight, top: base + podiumHeight, shop: shop.name });
  }

  const stepped = height > 30 && random() < 0.72;
  let roofWidth = width;
  let roofDepth = depth;
  if (stepped) {
    const lower = towerHeight * 0.62;
    const upper = towerHeight - lower;
    addTower(parent, facade, x, z, width, depth, lower, base + podiumHeight, tint);
    roofWidth = width * 0.72;
    roofDepth = depth * 0.72;
    addTower(parent, facade, x, z, roofWidth, roofDepth, upper, base + podiumHeight + lower, tint);
  } else {
    addTower(parent, facade, x, z, width, depth, towerHeight, base + podiumHeight, tint);
  }

  const roofTone = new THREE.Color(
    facade.family === 'brick' ? 0x9a6a4c : 0xd7cebd,
  ).offsetHSL(range(random, -0.02, 0.02), range(random, -0.04, 0.04), range(random, -0.08, 0.06));

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(roofWidth + 0.7, 0.45, roofDepth + 0.7),
    new THREE.MeshStandardMaterial({ color: roofTone, roughness: 0.95 }),
  );
  roof.position.set(x, base + height - 0.05, z);
  roof.castShadow = true;
  roof.receiveShadow = true;
  parent.add(roof);

  // A few rooftops carry a board with the building's name on it: the skyline gets words.
  if (height > 30 && chance(random, 0.42)) {
    const look = pick(random, ROOF_SIGN_LOOKS);
    const word = nextRoofWord ? nextRoofWord() : pick(random, ROOF_WORDS);
    const texture = createSignTexture(word, {
      width: 512,
      height: 128,
      size: Math.round(range(random, 54, 74)),
      background: look.background,
      border: look.border,
      face: look.face,
      weight: look.weight,
      tracking: look.tracking,
    });
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(roofWidth * 0.9, roofWidth * 0.22),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }),
    );
    board.position.set(x, base + height + roofWidth * 0.16, z + roofDepth / 2 + 0.2);
    parent.add(board);
  }

  buildings.push({
    x, z, width, depth, roofWidth, roofDepth, height,
    top: base + height,
    accent: facade.accent,
    family: facade.family,
  });
}


/** Put the whole bay together and hand back what the player, the cars and the HUD need. */
export function buildCity(scene, random) {
  const group = new THREE.Group();
  group.name = 'MarisolBay';
  const surfaces = {
    asphalt: createAsphalt(random),
    pavement: createPavement(random),
    facades: createFacadeTextures(random),
    storefronts: createStorefrontTextures(random),
  };
  const colliders = [];
  const buildings = [];
  PLATFORMS.length = 0;

  buildGround(group, surfaces);
  buildStreets(group);
  const water = buildBay(group, random);

  // Landmarks reserve their lots before the procedural blocks fill in around them.
  const landmarks = buildLandmarks(group, random, colliders, PLATFORMS);
  buildBlocks(group, random, surfaces, colliders, buildings, landmarks.reserved, []);
  parkCars(group, random, colliders);
  plantPalms(group, random, buildings);
  dressCorners(group, random, colliders);
  lightStreets(group);
  dressRoofs(group, random, buildings);

  scene.add(group);

  const spawn = { x: roadCenter(3) - 6.5, z: roadCenter(3) + 6.5 };
  return {
    group,
    colliders,
    buildings,
    landmarks,
    water,
    spawn,
    sun: new THREE.Vector3(SUN.x, SUN.y, SUN.z).normalize(),
  };
}
