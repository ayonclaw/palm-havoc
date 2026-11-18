// Pedestrians: walkers that loop the pavement rings of every block, plus a handful on the pier and
// the boardwalk. They stride, they stop to look at nothing, they run when a car comes at them or
// when a gun goes off, and they can be shot. Four instanced meshes draw the whole crowd.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, CITY_HALF, BLOCK_SIZE, PED, blockCenter, roadCenter } from './config.js';
import { range } from './rng.js';
import { groundHeight, pushOutOfBoxes } from './city.js';
import { createContactPatch } from './textures.js';

const SHIRTS = ['#d9603b', '#2f6f8a', '#e6d6ae', '#5c8f4a', '#b8443c', '#f0eee6', '#3a3f52', '#c98a3c', '#6d5a8a', '#92b8c4'];
const TROUSERS = ['#2f3b52', '#3d3a36', '#5b6470', '#26303a', '#7a6a52', '#4a4f57'];
const SKINS = ['#c98d63', '#a86a44', '#e2b48c', '#7d5236', '#d9a377', '#8f6242'];
const HAIRS = ['#241c16', '#3d2b1d', '#6b4a2a', '#1a1a1c', '#8a7a68'];

/** A polyline a pedestrian can walk: closed for a block ring, open (ping-pong) for the pier. */
function makePath(points, closed) {
  const segments = [];
  let total = 0;
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    segments.push({ from, to, length, start: total });
    total += length;
  }
  return { points, closed, segments, total };
}

function pointOnPath(path, distance) {
  let s = distance;
  if (path.closed) {
    s = ((s % path.total) + path.total) % path.total;
  } else {
    s = Math.max(0, Math.min(path.total, s));
  }
  for (const segment of path.segments) {
    if (s <= segment.start + segment.length || segment === path.segments[path.segments.length - 1]) {
      const t = segment.length > 0 ? (s - segment.start) / segment.length : 0;
      const x = segment.from.x + (segment.to.x - segment.from.x) * t;
      const z = segment.from.z + (segment.to.z - segment.from.z) * t;
      const heading = Math.atan2(segment.to.x - segment.from.x, segment.to.z - segment.from.z);
      return { x, z, heading };
    }
  }
  return { x: path.points[0].x, z: path.points[0].z, heading: 0 };
}

export class Pedestrians {
  constructor(scene, city, random) {
    this.city = city;
    this.random = random;
    this.people = [];
    this.time = 0;

    const legGeometry = new THREE.CapsuleGeometry(0.095, 0.56, 3, 6);
    legGeometry.translate(0, -0.4, 0);
    const torsoGeometry = new THREE.BoxGeometry(0.44, 0.62, 0.28);
    torsoGeometry.translate(0, 1.2, 0);
    const shoulderGeometry = new THREE.BoxGeometry(0.62, 0.14, 0.26);
    shoulderGeometry.translate(0, 1.47, 0);
    const headGeometry = new THREE.SphereGeometry(0.165, 8, 7);
    headGeometry.translate(0, 1.73, 0);
    const hairGeometry = new THREE.SphereGeometry(0.172, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62);
    hairGeometry.translate(0, 1.745, 0);

    const capacity = PED.count + 18;
    const material = (roughness = 0.8) => new THREE.MeshStandardMaterial({ roughness });
    this.legs = new THREE.InstancedMesh(legGeometry, material(0.78), capacity * 2);
    this.torso = new THREE.InstancedMesh(torsoGeometry, material(0.82), capacity);
    this.shoulders = new THREE.InstancedMesh(shoulderGeometry, material(0.82), capacity);
    this.head = new THREE.InstancedMesh(headGeometry, material(0.66), capacity);
    this.hair = new THREE.InstancedMesh(hairGeometry, material(0.9), capacity);
    this.capacity = capacity;

    // Contact patches: one soft smudge per walker, so feet meet the pavement.
    const patchGeometry = new THREE.PlaneGeometry(1, 1);
    patchGeometry.rotateX(-Math.PI / 2);
    this.patches = new THREE.InstancedMesh(
      patchGeometry,
      new THREE.MeshBasicMaterial({
        map: createContactPatch(), transparent: true, opacity: 0.55, depthWrite: false,
        color: 0x0a1014, toneMapped: false,
      }),
      capacity,
    );
    this.patches.frustumCulled = false;
    this.patches.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.patches.renderOrder = 1;
    scene.add(this.patches);

    for (const mesh of [this.legs, this.torso, this.shoulders, this.head, this.hair]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
    }
    this.legs.setColorAt(0, new THREE.Color(0xffffff));
    this.torso.setColorAt(0, new THREE.Color(0xffffff));
    this.head.setColorAt(0, new THREE.Color(0xffffff));
    this.hair.setColorAt(0, new THREE.Color(0xffffff));

    this.paths = this.buildPaths();
    for (let index = 0; index < PED.count; index += 1) this.addWalker(index);
    this.writeMatrices();
  }

  /** Two rings per block, plus the pier and the boardwalk: the crowd's whole road map. */
  buildPaths() {
    const rings = [];
    for (let blockX = 0; blockX < CITY.cells; blockX += 1) {
      for (let blockZ = 0; blockZ < CITY.cells; blockZ += 1) {
        const cx = blockCenter(blockX);
        const cz = blockCenter(blockZ);
        const centrality = 2 - Math.max(Math.abs(blockX - 2), Math.abs(blockZ - 2));
        // An inner and an outer lane along the pavement, so a block carries two-way foot traffic.
        for (const radius of [BLOCK_SIZE / 2 - 3.1, BLOCK_SIZE / 2 - 1.1]) {
          const corners = [
            { x: cx - radius, z: cz - radius },
            { x: cx + radius, z: cz - radius },
            { x: cx + radius, z: cz + radius },
            { x: cx - radius, z: cz + radius },
          ];
          const path = makePath(corners, true);
          path.centre = { x: cx, z: cz };
          path.centrality = centrality;
          rings.push(path);
        }
      }
    }
    const pierX = roadCenter(3) + 8;
    const pier = makePath([
      { x: pierX - 3, z: -286 },
      { x: pierX - 3, z: -292 },
      { x: pierX - 3, z: -352 },
    ], false);
    pier.y = 1.4;
    pier.centrality = 2;
    const boardwalk = makePath([
      { x: -240, z: -300 },
      { x: 240, z: -300 },
    ], false);
    boardwalk.centrality = 0;

    // The busy pavements: the four runs around the central crossing, and their far halves.
    const corridors = [];
    for (const x of [41, 63]) {
      for (const [from, to] of [[-100, 0], [0, 100]]) {
        corridors.push(makePath([{ x, z: from }, { x, z: to }], false));
      }
    }
    for (const z of [41, 63]) {
      for (const [from, to] of [[-100, 0], [0, 100]]) {
        corridors.push(makePath([{ x: from, z }, { x: to, z }], false));
      }
    }
    for (const corridor of corridors) corridor.centrality = 2;

    // Crossings: the crowd gathers at the kerb and walks over, which is where a crowd reads.
    const crossings = [];
    for (let junctionX = 1; junctionX <= CITY.cells - 2; junctionX += 1) {
      for (let junctionZ = 1; junctionZ <= CITY.cells - 2; junctionZ += 1) {
        const x = roadCenter(junctionX);
        const z = roadCenter(junctionZ);
        crossings.push(makePath([{ x: x - 10, z: z + 11.4 }, { x: x + 10, z: z + 11.4 }], false));
        crossings.push(makePath([{ x: x - 10, z: z - 11.4 }, { x: x + 10, z: z - 11.4 }], false));
        crossings.push(makePath([{ x: x + 11.4, z: z - 10 }, { x: x + 11.4, z: z + 10 }], false));
        crossings.push(makePath([{ x: x - 11.4, z: z - 10 }, { x: x - 11.4, z: z + 10 }], false));
        for (const crossing of crossings.slice(-4)) crossing.centrality = 2;
        // The middle junctions are where the crowd is: the same crossings, drawn three times, so a
        // walker is three times as likely to be sent to the middle of the bay as to its edge.
        for (const crossing of crossings.slice(-4)) {
          crossings.push(crossing, crossing);
        }
      }
    }

    // Shopfronts: a short beat of pavement outside each named door, where people stop and look in.
    const fronts = [];
    const radius = BLOCK_SIZE / 2 - 1.7;
    for (const building of this.city.buildings ?? []) {
      if (!building.shop) continue;
      const blockX = Math.round((building.x + CITY_HALF) / CITY.pitch - 0.5);
      const blockZ = Math.round((building.z + CITY_HALF) / CITY.pitch - 0.5);
      if (blockX < 0 || blockZ < 0 || blockX >= CITY.cells || blockZ >= CITY.cells) continue;
      const cx = blockCenter(blockX);
      const cz = blockCenter(blockZ);
      const offX = building.x - cx;
      const offZ = building.z - cz;
      const half = Math.max(4, (Math.abs(offX) > Math.abs(offZ) ? building.depth : building.width) / 2 + 2);
      const path = Math.abs(offX) > Math.abs(offZ)
        ? makePath([{ x: cx + Math.sign(offX) * radius, z: building.z - half }, { x: cx + Math.sign(offX) * radius, z: building.z + half }], false)
        : makePath([{ x: building.x - half, z: cz + Math.sign(offZ) * radius }, { x: building.x + half, z: cz + Math.sign(offZ) * radius }], false);
      path.centrality = 1 + Math.max(0, 2 - Math.max(Math.abs(blockX - 2), Math.abs(blockZ - 2)));
      fronts.push(path);
    }

    return { rings, extra: [pier, pier, boardwalk], corridors, crossings, fronts };
  }

  /** Choose a spot for a new walker: the avenues first, the block rings after. */
  addWalker(index) {
    const random = this.random;
    let path;
    let distance;

    if (index < 20) {
      path = this.paths.extra[index % this.paths.extra.length];
      distance = range(random, 0, path.total);
    } else if (index < PED.count * 0.46) {
      // Crossings: a queue at the kerb, walking over, walking back. This is what a crowd looks like.
      path = this.paths.crossings[Math.floor(random() * this.paths.crossings.length)];
      distance = range(random, 0, path.total);
    } else if (index < PED.count * 0.66) {
      // Shop doors: people stopping to look in a window.
      path = this.paths.fronts[Math.floor(random() * this.paths.fronts.length)];
      distance = range(random, 0, path.total);
    } else if (index < PED.count * 0.9) {
      // The rest pace the avenue they can see, with a few on the block rings.
      path = random() < 0.84
        ? this.paths.corridors[Math.floor(random() * this.paths.corridors.length)]
        : this.paths.rings[Math.floor(random() * this.paths.rings.length)];
      distance = range(random, 0, path.total);
    } else {
      // Weighted pick: a ring in the middle of the bay draws four times a ring at the edge.
      let total = 0;
      const weights = this.paths.rings.map((ring) => {
        const weight = 1 + Math.max(0, ring.centrality) * 3;
        total += weight;
        return weight;
      });
      let ticket = random() * total;
      let chosen = 0;
      for (let index2 = 0; index2 < weights.length; index2 += 1) {
        ticket -= weights[index2];
        if (ticket <= 0) {
          chosen = index2;
          break;
        }
      }
      path = this.paths.rings[chosen];
      distance = range(random, 0, path.total);
    }

    const spot = pointOnPath(path, distance);
    const person = {
      index,
      path,
      home: path,
      distance,
      dir: random() < 0.5 ? 1 : -1,
      speed: PED.speed * range(random, 0.75, 1.3),
      stride: range(random, 0, Math.PI * 2),
      pause: 0,
      panic: 0,
      panicX: 0,
      panicZ: 0,
      dead: false,
      warm: 0,
      x: spot.x,
      z: spot.z,
      y: path.y ? path.y : groundHeight(spot.x, spot.z),
      heading: spot.heading,
      free: false,
      vx: 0,
      vz: 0,
      id: null,
      shirt: new THREE.Color(SHIRTS[Math.floor(random() * SHIRTS.length)]),
      trousers: new THREE.Color(TROUSERS[Math.floor(random() * TROUSERS.length)]),
      skin: new THREE.Color(SKINS[Math.floor(random() * SKINS.length)]),
      hairColour: new THREE.Color(HAIRS[Math.floor(random() * HAIRS.length)]),
    };
    this.people.push(person);
    this.torso.setColorAt(index, person.shirt);
    this.shoulders.setColorAt(index, person.shirt);
    this.legs.setColorAt(index * 2, person.trousers);
    this.legs.setColorAt(index * 2 + 1, person.trousers);
    this.head.setColorAt(index, person.skin);
    this.hair.setColorAt(index, person.hairColour);
    this.torso.instanceColor.needsUpdate = true;
    this.shoulders.instanceColor.needsUpdate = true;
    this.legs.instanceColor.needsUpdate = true;
    this.head.instanceColor.needsUpdate = true;
    this.hair.instanceColor.needsUpdate = true;
    return person;
  }

  /** A named walker for a mission: same crowd, but the game knows who it is. */
  addScripted(id, x, z) {
    const person = this.addWalker(this.people.length);
    person.id = id;
    person.free = true;
    person.x = x;
    person.z = z;
    person.y = groundHeight(x, z);
    person.heading = 0;
    person.vx = 0;
    person.vz = 0;
    return person;
  }

  /** Everybody inside the radius runs from `source` for `seconds`. */
  scatter(source, radius = PED.panicRadius, seconds = PED.panicTime) {
    let scared = 0;
    for (const person of this.people) {
      if (person.dead) continue;
      const distance = Math.hypot(person.x - source.x, person.z - source.z);
      if (distance > radius) continue;
      person.panic = seconds * range(this.random, 0.7, 1.1);
      person.panicX = person.x - source.x;
      person.panicZ = person.z - source.z;
      const length = Math.hypot(person.panicX, person.panicZ) || 1;
      person.panicX /= length;
      person.panicZ /= length;
      person.free = true;
      scared += 1;
    }
    return scared;
  }

  update(dt, context) {
    this.time += dt;
    const threats = (context && context.threats) || [];
    const focus = context && context.focus;

    for (const person of this.people) {
      if (person.dead) continue;

      // A car bearing down on them is enough to send someone running; passing traffic is not.
      if (person.panic <= 0.3 && threats.length) {
        for (const car of threats) {
          if (car.speed < 11) continue;
          const dx = person.x - car.x;
          const dz = person.z - car.z;
          const forwardX = Math.sin(car.heading);
          const forwardZ = Math.cos(car.heading);
          const ahead = -(dx * forwardX + dz * forwardZ);
          if (ahead < 0 || ahead > PED.fleeRadius) continue;
          // Only somebody who is actually in the car's path, not standing three lanes away.
          const lateral = Math.abs(dx * forwardZ - dz * forwardX);
          if (lateral > 3.4) continue;
          const length = Math.hypot(dx, dz) || 1;
          person.panic = PED.panicTime;
          person.panicX = dx / length;
          person.panicZ = dz / length;
          person.free = true;
          break;
        }
      }

      if (person.panic > 0) {
        person.panic -= dt;
        const speed = PED.runSpeed * (0.85 + 0.25 * Math.sin(person.stride * 0.4));
        person.x += person.panicX * speed * dt;
        person.z += person.panicZ * speed * dt;
        person.heading = Math.atan2(person.panicX, person.panicZ);
        const corrected = pushOutOfBoxes(this.city.colliders, person.x, person.z, PED.radius);
        person.x = corrected.x;
        person.z = corrected.z;
        person.y = groundHeight(person.x, person.z);
        person.stride += speed * dt * 2.8;
        if (person.panic <= 0) {
          person.free = false;
          // Back to the pavement they came from, at the point nearest where they ran to.
          const home = person.home ?? person.path;
          person.path = home;
          let closest = 0;
          let closestDistance = Infinity;
          for (let step = 0; step < home.total; step += 2) {
            const point = pointOnPath(home, step);
            const distance = Math.hypot(point.x - person.x, point.z - person.z);
            if (distance < closestDistance) {
              closestDistance = distance;
              closest = step;
            }
          }
          person.distance = closest;
          person.y = groundHeight(person.x, person.z);
        }
        continue;
      }

      if (person.pause > 0) {
        person.pause -= dt;
        person.stride += dt * 0.6;
      } else {
        if (!person.free) {
          person.distance += person.dir * person.speed * dt;
          const point = pointOnPath(person.path, person.distance);
          // A little lateral wander, so a pavement full of walkers is not a column of ants.
          const wobble = Math.sin(person.stride * 0.42 + person.index) * 0.62;
          person.x = point.x + Math.cos(point.heading) * wobble;
          person.z = point.z - Math.sin(point.heading) * wobble;
          person.heading = point.heading + (person.dir < 0 ? Math.PI : 0);
          person.y = person.path.y ? person.path.y : groundHeight(person.x, person.z);
          if (!person.path.closed) {
            if (person.distance > person.path.total || person.distance < 0) person.dir *= -1;
          }
          person.stride += person.speed * dt * 3.1;
          if (this.random() < dt * 0.16) person.pause = range(this.random, 0.6, 2.4);
        } else {
          person.x += person.vx * dt;
          person.z += person.vz * dt;
          person.vx *= 0.86;
          person.vz *= 0.86;
          person.y = groundHeight(person.x, person.z);
          person.stride += 0.6 * dt;
        }
      }

      // Keep out of the player's body: walkers shoulder past rather than through.
      if (focus) {
        const dx = person.x - focus.x;
        const dz = person.z - focus.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.85 && distance > 0.001) {
          person.x += (dx / distance) * (0.85 - distance) * 0.5;
          person.z += (dz / distance) * (0.85 - distance) * 0.5;
        }
      }
    }
    this.writeMatrices();
  }

  writeMatrices() {
    const dummy = new THREE.Object3D();
    const total = this.capacity;
    for (let index = 0; index < total; index += 1) {
      const person = this.people[index];
      if (!person || person.dead) {
        dummy.position.set(0, -400, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.001);
        dummy.updateMatrix();
        this.torso.setMatrixAt(index, dummy.matrix);
        this.shoulders.setMatrixAt(index, dummy.matrix);
        this.head.setMatrixAt(index, dummy.matrix);
        this.hair.setMatrixAt(index, dummy.matrix);
        this.legs.setMatrixAt(index * 2, dummy.matrix);
        this.legs.setMatrixAt(index * 2 + 1, dummy.matrix);
        this.patches.setMatrixAt(index, dummy.matrix);
        continue;
      }

      const moving = person.panic > 0 ? 1 : person.pause > 0 ? 0 : 1;
      const swing = Math.sin(person.stride * 1.6) * 0.52 * moving;
      const bounce = Math.abs(Math.sin(person.stride * 1.6)) * 0.035 * moving;
      const cos = Math.cos(person.heading);
      const sin = Math.sin(person.heading);

      dummy.position.set(person.x, person.y + 0.03, person.z);
      dummy.rotation.set(0, person.heading, 0);
      dummy.scale.set(1.5, 1, 1.5);
      dummy.updateMatrix();
      this.patches.setMatrixAt(index, dummy.matrix);

      dummy.position.set(person.x, person.y + bounce, person.z);
      dummy.rotation.set(0, person.heading, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.torso.setMatrixAt(index, dummy.matrix);
      this.shoulders.setMatrixAt(index, dummy.matrix);
      this.head.setMatrixAt(index, dummy.matrix);
      this.hair.setMatrixAt(index, dummy.matrix);

      for (let side = 0; side < 2; side += 1) {
        const lateral = side === 0 ? -0.13 : 0.13;
        const legSwing = side === 0 ? swing : -swing;
        dummy.position.set(person.x + lateral * cos, person.y + 0.9 + bounce * 0.5, person.z - lateral * sin);
        dummy.rotation.set(0, person.heading, 0);
        dummy.rotateX(legSwing);
        dummy.updateMatrix();
        this.legs.setMatrixAt(index * 2 + side, dummy.matrix);
      }
    }
    this.torso.instanceMatrix.needsUpdate = true;
    this.shoulders.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
    this.hair.instanceMatrix.needsUpdate = true;
    this.legs.instanceMatrix.needsUpdate = true;
    this.patches.instanceMatrix.needsUpdate = true;
  }

  /** Walkers that can be shot: the nearest one along a ray, ignoring the dead. */
  hitTest(origin, direction, maxDistance) {
    let best = null;
    for (const person of this.people) {
      if (person.dead) continue;
      const toPerson = new THREE.Vector3(person.x - origin.x, person.y + 1.1 - origin.y, person.z - origin.z);
      const along = toPerson.dot(direction);
      if (along < 0.5 || along > maxDistance) continue;
      const closest = new THREE.Vector3().copy(origin).addScaledVector(direction, along);
      const miss = Math.hypot(closest.x - person.x, closest.y - (person.y + 1.1), closest.z - person.z);
      if (miss < 0.75 && (!best || along < best.distance)) best = { person, distance: along };
    }
    return best;
  }

  kill(person) {
    if (!person || person.dead) return false;
    person.dead = true;
    return true;
  }

  get living() {
    return this.people.reduce((total, person) => total + (person.dead ? 0 : 1), 0);
  }

  /** Nearest living walker to a point, for mission targets and for the police to shout at. */
  nearest(position, maxDistance = 40, exclude = []) {
    let best = null;
    let bestDistance = maxDistance;
    for (const person of this.people) {
      if (person.dead || exclude.includes(person)) continue;
      const distance = Math.hypot(person.x - position.x, person.z - position.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = person;
      }
    }
    return best;
  }
}
