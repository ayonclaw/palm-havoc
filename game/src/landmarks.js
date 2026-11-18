// The three things you can point at from the water and name: Casa Alta with its spire, the pier
// out over the bay with the Marisol Wheel turning at the end of it, and the lighthouse on the
// western headland. Plus the marina, the boulevard gantry and the beach promenade.
import * as THREE from '../vendor/three.module.min.js';
import { CITY_HALF, CITY, OCEAN, COLORS, blockCenter, roadCenter } from './config.js';
import { createSignTexture, createFacadeTextures } from './textures.js';
import { range } from './rng.js';

const SIGNS = {
  casaAlta: createSignTexture('CASA ALTA', { width: 512, height: 128, size: 62, background: '#17242b' }),
  pier: createSignTexture('PIER NINE', { width: 512, height: 128, size: 62, background: '#241a2c', border: '#7fd4e0', colour: '#ffe9c4' }),
  arcade: createSignTexture('ARCADE', { width: 512, height: 128, size: 66, background: '#331426', border: '#ffcf6b', colour: '#ffd9a1' }),
  gantry: createSignTexture('MARISOL BAY', { width: 1024, height: 128, size: 78, background: '#10222a', border: '#ff7a4d' }),
  hotel: createSignTexture('HOTEL MARISOL', { width: 512, height: 128, size: 52, background: '#20303a', border: '#e8d6b4' }),
};

function box(width, height, depth, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function signPlane(texture, width, height, x, y, z, rotationY = 0) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotationY;
  return mesh;
}

/* --------------------------------------------------------------- Casa Alta */

/** The tallest thing in Marisol Bay: a stepped deco tower, a crown of fins and a lit spire. */
function buildCasaAlta(parent, x, z) {
  const stone = new THREE.MeshStandardMaterial({ color: 0xf2e3c6, roughness: 0.55, metalness: 0.12 });
  const stoneDark = new THREE.MeshStandardMaterial({ color: 0xd8c5a2, roughness: 0.7 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8a6a3c, roughness: 0.38, metalness: 0.75 });
  const glazing = new THREE.MeshStandardMaterial({ color: 0x2b444e, roughness: 0.16, metalness: 0.6 });

  const base = CITY.curbHeight;
  const tiers = [
    { w: 40, d: 34, h: 34 },
    { w: 32, d: 27, h: 30 },
    { w: 24, d: 21, h: 26 },
    { w: 16, d: 14, h: 20 },
  ];
  let y = base;
  tiers.forEach((tier, index) => {
    const body = box(tier.w, tier.h, tier.d, index % 2 === 0 ? stone : stoneDark, x, y + tier.h / 2, z);
    parent.add(body);
    // Vertical fins up each face: the deco signature.
    for (let fin = -1; fin <= 1; fin += 1) {
      parent.add(box(0.9, tier.h - 2, 0.9, bronze, x + fin * (tier.w / 3), y + tier.h / 2, z + tier.d / 2 + 0.2));
      parent.add(box(0.9, tier.h - 2, 0.9, bronze, x + fin * (tier.w / 3), y + tier.h / 2, z - tier.d / 2 - 0.2));
      parent.add(box(0.9, tier.h - 2, 0.9, bronze, x + tier.w / 2 + 0.2, y + tier.h / 2, z + (fin * tier.d) / 3));
      parent.add(box(0.9, tier.h - 2, 0.9, bronze, x - tier.w / 2 - 0.2, y + tier.h / 2, z + (fin * tier.d) / 3));
    }
    // A recessed glazed band under each setback.
    parent.add(box(tier.w * 0.86, 4.2, tier.d * 0.86, glazing, x, y + tier.h - 3.4, z));
    parent.add(box(tier.w + 1.2, 0.8, tier.d + 1.2, stone, x, y + tier.h - 0.4, z));
    y += tier.h;
  });

  // Crown: a ring of fins and the mast.
  for (let fin = 0; fin < 8; fin += 1) {
    const angle = (fin / 8) * Math.PI * 2;
    parent.add(box(0.7, 9, 0.7, bronze, x + Math.cos(angle) * 6.4, y + 4.5, z + Math.sin(angle) * 6.4));
  }
  parent.add(box(12, 1.4, 11, stone, x, y + 0.6, z));
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.5, 26, 8), bronze);
  mast.position.set(x, y + 13.4, z);
  mast.castShadow = true;
  parent.add(mast);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.0, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xff9a5a, emissiveIntensity: 2.2, roughness: 0.4 }),
  );
  beacon.position.set(x, y + 27, z);
  parent.add(beacon);

  parent.add(signPlane(SIGNS.casaAlta, 30, 7.5, x, base + 36, z + 18.4, 0));
  parent.add(signPlane(SIGNS.casaAlta, 30, 7.5, x, base + 36, z - 18.4, Math.PI));

  return { x, z, height: base + y + 27, roof: base + y };
}

/* ------------------------------------------------------------------ pier */

/** Pier Nine: a plank deck out over the water, the arcade on it, and the Marisol Wheel. */
function buildPier(parent) {
  const plankTexture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#9a7c58';
    ctx.fillRect(0, 0, 256, 256);
    for (let plank = 0; plank < 16; plank += 1) {
      const y = plank * 16;
      ctx.fillStyle = plank % 2 ? 'rgba(60,42,26,0.22)' : 'rgba(255,232,200,0.10)';
      ctx.fillRect(0, y, 256, 14);
      for (let grain = 0; grain < 8; grain += 1) {
        ctx.fillStyle = `rgba(60,42,26,${range(Math.random, 0.05, 0.16).toFixed(2)})`;
        ctx.fillRect(Math.random() * 256, y + Math.random() * 12, range(Math.random, 10, 40), 1);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 16);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();

  const x = roadCenter(3) + 8;
  const headZ = OCEAN.beachStart - 6;
  const endZ = OCEAN.waterStart - 66;
  const deckY = 1.1;
  const length = headZ - endZ;

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.6, length),
    new THREE.MeshStandardMaterial({ map: plankTexture, roughness: 0.86 }),
  );
  deck.position.set(x, deckY, (headZ + endZ) / 2);
  deck.castShadow = true;
  deck.receiveShadow = true;
  parent.add(deck);

  // Piles and railings: the silhouette is what reads from the shore.
  const pileMaterial = new THREE.MeshStandardMaterial({ color: 0x6d5637, roughness: 0.95 });
  for (let along = 0; along < 12; along += 1) {
    const z = headZ - along * (length / 11);
    for (const side of [-1, 1]) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 7, 6), pileMaterial);
      pile.position.set(x + side * 7.2, -2.2, z);
      pile.castShadow = true;
      parent.add(pile);
      parent.add(box(0.16, 1.0, 0.16, pileMaterial, x + side * 7.2, deckY + 0.9, z));
    }
    parent.add(box(15, 0.14, 0.14, pileMaterial, x, deckY + 1.42, z));
  }

  // The arcade hall: a lit pavilion near the shore end of the pier.
  const arcadeZ = headZ - 30;
  const wall = new THREE.MeshStandardMaterial({ color: 0x3b2b46, roughness: 0.7 });
  const neon = new THREE.MeshStandardMaterial({ color: 0xffb55e, emissive: 0xff8a3c, emissiveIntensity: 1.4, roughness: 0.4 });
  parent.add(box(12, 5.4, 9, wall, x, deckY + 2.7, arcadeZ));
  parent.add(box(13, 0.5, 10, neon, x, deckY + 5.5, arcadeZ));
  for (let window = -1; window <= 1; window += 1) {
    parent.add(box(3.2, 2.6, 0.2, new THREE.MeshStandardMaterial({
      color: 0xffd9a0, emissive: 0xffb066, emissiveIntensity: 1.1, roughness: 0.3,
    }), x + window * 3.8, deckY + 2.4, arcadeZ + 4.55));
  }
  parent.add(signPlane(SIGNS.arcade, 9, 2.25, x, deckY + 6.6, arcadeZ + 4.6, 0));
  parent.add(signPlane(SIGNS.arcade, 9, 2.25, x, deckY + 6.6, arcadeZ - 4.6, Math.PI));

  // The wheel: two rims, spokes, ten gondolas, an A-frame holding it up.
  const wheelZ = endZ + 16;
  const wheelRadius = 13;
  const hubY = deckY + 15.5;
  const wheel = new THREE.Group();
  wheel.position.set(x, hubY, wheelZ);
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.45, metalness: 0.4 });
  const spokeMaterial = new THREE.MeshStandardMaterial({ color: 0xd9d6cc, roughness: 0.5, metalness: 0.35 });
  const gondolaMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6f8a, roughness: 0.5, metalness: 0.2 });
  const gondolaTrim = new THREE.MeshStandardMaterial({ color: 0xf7c86a, roughness: 0.45, metalness: 0.3 });

  const spinner = new THREE.Group();
  wheel.add(spinner);
  for (const side of [-2.4, 2.4]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius, 0.22, 6, 40), rimMaterial);
    rim.position.z = side;
    rim.castShadow = true;
    spinner.add(rim);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius * 0.44, 0.16, 6, 28), rimMaterial);
    inner.position.z = side;
    spinner.add(inner);
  }
  for (let spoke = 0; spoke < 16; spoke += 1) {
    const angle = (spoke / 16) * Math.PI * 2;
    const bar = box(0.16, wheelRadius, 0.16, spokeMaterial, 0, 0, 0);
    bar.position.set(Math.cos(angle) * wheelRadius / 2, Math.sin(angle) * wheelRadius / 2, 0);
    bar.rotation.z = angle - Math.PI / 2;
    spinner.add(bar);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 5.4, 12), rimMaterial);
  hub.rotation.x = Math.PI / 2;
  spinner.add(hub);

  const gondolas = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    const gondola = new THREE.Group();
    gondola.position.set(Math.cos(angle) * wheelRadius, Math.sin(angle) * wheelRadius, 0);
    gondola.add(box(1.5, 1.5, 2.4, gondolaMaterial, 0, -1.4, 0));
    gondola.add(box(1.7, 0.2, 2.6, gondolaTrim, 0, -0.66, 0));
    gondola.add(box(1.6, 0.14, 2.5, gondolaTrim, 0, -2.2, 0));
    spinner.add(gondola);
    gondolas.push(gondola);
  }

  // A-frame legs, standing on the deck either side of the hub.
  for (const side of [-1, 1]) {
    for (const lean of [-1, 1]) {
      const legHeight = hubY - (deckY + 0.3);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, legHeight, 7), rimMaterial);
      leg.position.set(x + side * (wheelRadius * 0.62), deckY + 0.3 + legHeight / 2, wheelZ + lean * 3.2);
      leg.rotation.z = side * 0.34;
      leg.rotation.x = -lean * 0.12;
      leg.castShadow = true;
      parent.add(leg);
    }
  }
  parent.add(wheel);
  parent.add(signPlane(SIGNS.pier, 14, 3.5, x, deckY + 8.2, headZ - 8, 0));

  return {
    deck: { minX: x - 8, maxX: x + 8, minZ: endZ, maxZ: headZ, y: deckY + 0.3 },
    x,
    headZ,
    endZ,
    deckY,
    arcade: { x, z: arcadeZ },
    wheel: { x, z: wheelZ },
    tick(dt) {
      spinner.rotation.z -= dt * 0.14;
      for (const gondola of gondolas) gondola.rotation.z = -spinner.rotation.z;
    },
  };
}

/* ------------------------------------------------------------ lighthouse */

/** The west headland: a rock shelf, a white tower with a red band, and a keeper's cottage. */
function buildLighthouse(parent, x, z) {
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.68 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 });
  const rock = new THREE.MeshStandardMaterial({ color: 0x8d8574, roughness: 1 });

  const shelf = new THREE.Mesh(new THREE.CylinderGeometry(26, 32, 4.2, 12), rock);
  shelf.position.set(x, -0.6, z);
  shelf.receiveShadow = true;
  shelf.castShadow = true;
  parent.add(shelf);

  const baseY = 1.5;
  parent.add(box(7, 1.6, 7, white, x, baseY + 0.8, z));
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.5, 22, 14), white);
  tower.position.set(x, baseY + 1.6 + 11, z);
  tower.castShadow = true;
  parent.add(tower);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.2, 3.4, 14), red);
  band.position.set(x, baseY + 11, z);
  band.castShadow = true;
  parent.add(band);

  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0x3c4348, roughness: 0.8 }));
  gallery.position.set(x, baseY + 23.2, z);
  parent.add(gallery);
  const lampRoom = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 2.0, 3.2, 10),
    new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffcc7a, emissiveIntensity: 1.6, roughness: 0.25 }),
  );
  lampRoom.position.set(x, baseY + 25, z);
  parent.add(lampRoom);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.4, 10), new THREE.MeshStandardMaterial({ color: 0x2f3a40, roughness: 0.7 }));
  cap.position.set(x, baseY + 27.8, z);
  parent.add(cap);

  // Keeper's cottage.
  parent.add(box(9, 4, 6, white, x + 11, baseY + 2.2, z + 3));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(6.6, 3.2, 4), red);
  roof.position.set(x + 11, baseY + 5.8, z + 3);
  roof.rotation.y = Math.PI / 4;
  parent.add(roof);
  parent.add(box(2.2, 0.6, 2.4, new THREE.MeshStandardMaterial({ color: 0x6b7a83, roughness: 0.8 }), x + 11, baseY + 7.6, z + 3));

  return { x, z, top: baseY + 29 };
}

/* --------------------------------------------------------------- marina */

/** Sailboats swinging at their moorings inside the breakwater. */
function buildMarina(parent, random) {
  const hull = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.5 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2b4b5c, roughness: 0.6 });
  const sail = new THREE.MeshStandardMaterial({ color: 0xf8f4e8, roughness: 0.85, side: THREE.DoubleSide });
  const boats = [];
  for (let index = 0; index < 7; index += 1) {
    const x = -140 + index * 26 + range(random, -6, 6);
    const z = OCEAN.waterStart - 34 - (index % 3) * 16;
    const boat = new THREE.Group();
    const hullMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.1, 7.5, 8), hull);
    hullMesh.rotation.z = Math.PI / 2;
    hullMesh.rotation.y = Math.PI / 2;
    hullMesh.position.y = 0.3;
    hullMesh.castShadow = true;
    boat.add(hullMesh);
    boat.add(box(7.4, 0.4, 3.0, trim, 0, 0.62, 0));
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 9, 5), trim);
    mast.position.set(0.4, 5.1, 0);
    boat.add(mast);
    const triangle = new THREE.Shape();
    triangle.moveTo(0, 0);
    triangle.lineTo(0, 8.4);
    triangle.lineTo(3.4, 0);
    triangle.closePath();
    const sailMesh = new THREE.Mesh(new THREE.ShapeGeometry(triangle), sail);
    sailMesh.position.set(0.6, 0.9, 0);
    sailMesh.rotation.y = -Math.PI / 2;
    sailMesh.castShadow = true;
    boat.add(sailMesh);
    boat.position.set(x, OCEAN.level + 0.4, z);
    boat.rotation.y = range(random, -0.4, 0.4);
    parent.add(boat);
    boats.push(boat);
  }
  return {
    tick(time) {
      boats.forEach((boat, index) => {
        boat.position.y = OCEAN.level + 0.4 + Math.sin(time * 0.9 + index) * 0.16;
        boat.rotation.z = Math.sin(time * 0.7 + index * 1.3) * 0.03;
      });
    },
  };
}

/* ------------------------------------------------------------- promenade */

/** A boardwalk of palapas along the sand, the thing that says beach from the air. */
function buildPromenade(parent, random) {
  const thatch = new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 1 });
  const post = new THREE.MeshStandardMaterial({ color: 0x8a6b4a, roughness: 0.95 });
  const shade = new THREE.MeshStandardMaterial({ color: 0xe8552f, roughness: 0.85 });
  for (let index = 0; index < 9; index += 1) {
    const x = -230 + index * 58 + range(random, -8, 8);
    const z = OCEAN.beachStart - 22 - range(random, 0, 16);
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 3.1, 6), post);
      pole.position.set(x + side * 1.8, 1.55, z);
      parent.add(pole);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.5, 8), thatch);
    roof.position.set(x, 3.4, z);
    roof.castShadow = true;
    parent.add(roof);
    const towel = box(2.4, 0.06, 1.2, shade, x, 0.28, z + 2.6);
    parent.add(towel);
  }
}

/** The gantry sign over the boulevard, straddling the road so it frames the avenue. */
function buildGantry(parent) {
  const x = roadCenter(3);
  const z = roadCenter(4) - 30;
  const steel = new THREE.MeshStandardMaterial({ color: 0x39474d, roughness: 0.6, metalness: 0.5 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 11, 8), steel);
    post.position.set(x + side * 10.5, 5.5, z);
    post.castShadow = true;
    parent.add(post);
  }
  parent.add(box(23, 0.7, 0.7, steel, x, 10.6, z));
  parent.add(signPlane(SIGNS.gantry, 16, 4, x, 8.4, z + 0.1, 0));
  parent.add(signPlane(SIGNS.gantry, 16, 4, x, 8.4, z - 0.1, Math.PI));
  return { x, z };
}

/** The waterfront hotel, its name over the doors: the last building before the sand. */
function buildHotel(parent, x, z) {
  const body = new THREE.MeshStandardMaterial({ color: 0xf7ead2, roughness: 0.6 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2d6f74, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x35545e, roughness: 0.15, metalness: 0.6 });
  parent.add(box(34, 22, 20, body, x, CITY.curbHeight + 11, z));
  for (let floor = 0; floor < 6; floor += 1) {
    parent.add(box(34.6, 0.5, 20.6, trim, x, CITY.curbHeight + 4 + floor * 3.2, z));
    for (let bay = 0; bay < 7; bay += 1) {
      parent.add(box(3.2, 1.9, 0.3, glass, x - 13.5 + bay * 4.5, CITY.curbHeight + 5.6 + floor * 3.2, z + 10.2));
    }
  }
  parent.add(box(36, 1.2, 22, trim, x, CITY.curbHeight + 22.4, z));
  parent.add(signPlane(SIGNS.hotel, 18, 4.4, x, CITY.curbHeight + 25.4, z + 10.4, 0));
  return { x, z, height: CITY.curbHeight + 22 };
}

/**
 * Build every landmark and hand back the named points the missions use and a tick for the
 * things that move. Footprints go into `colliders` and the pier deck into `platforms`.
 */
export function buildLandmarks(parent, random, colliders, platforms) {
  const casaX = blockCenter(1) - 6;
  const casaZ = blockCenter(3) - 4;
  const casa = buildCasaAlta(parent, casaX, casaZ);
  colliders.push({ minX: casaX - 21, maxX: casaX + 21, minZ: casaZ - 18, maxZ: casaZ + 18 });

  const pier = buildPier(parent);
  platforms.push(pier.deck);
  colliders.push({ minX: pier.arcade.x - 6.5, maxX: pier.arcade.x + 6.5, minZ: pier.arcade.z - 5, maxZ: pier.arcade.z + 5 });

  const lighthouse = buildLighthouse(parent, -CITY_HALF - 66, OCEAN.beachStart - 34);
  const marina = buildMarina(parent, random);
  buildPromenade(parent, random);
  const gantry = buildGantry(parent);
  const hotel = buildHotel(parent, blockCenter(2), OCEAN.beachStart + 26);

  return {
    tick(dt, time) {
      pier.tick(dt);
      marina.tick(time);
    },
    casaAlta: { x: casaX, z: casaZ, height: casa.height },
    pier: { x: pier.x, z: pier.headZ - 4 },
    arcade: pier.arcade,
    wheel: pier.wheel,
    lighthouse,
    gantry,
    hotel,
    reserved: [
      { minX: casaX - 24, maxX: casaX + 24, minZ: casaZ - 21, maxZ: casaZ + 21 },
      { minX: hotel.x - 20, maxX: hotel.x + 20, minZ: hotel.z - 13, maxZ: hotel.z + 13 },
    ],
  };
}
