// Traffic: cars that orbit the lane graph, queue at the junctions when the lights are against
// them, brake for whatever is in front of them, and can be hit, shot or stolen. Every car is drawn
// from six instanced meshes, so forty of them cost about as much as six.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, CITY_HALF, TRAFFIC, TRAFFIC_PAINTS, roadCenter } from './config.js';
import { createContactPatch } from './textures.js';
import { pick, range } from './rng.js';

const UP = new THREE.Vector3(0, 1, 0);

/** Signed shortest difference between two angles. */
function angleDelta(from, to) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function headingFor(axis, dir) {
  if (axis === 'z') return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

function laneLat(axis, dir) {
  return axis === 'z' ? -dir * TRAFFIC.laneOffset : dir * TRAFFIC.laneOffset;
}

/** The next junction index ahead of `along` in the direction of travel, clamped to the grid. */
function nextNode(along, dir) {
  const t = (along + CITY_HALF) / CITY.pitch;
  const index = dir > 0 ? Math.floor(t) + 1 : Math.ceil(t) - 1;
  return Math.max(0, Math.min(CITY.cells, index));
}

export class Traffic {
  constructor(scene, city, random, initialFocus) {
    this.city = city;
    this.random = random;
    this.count = TRAFFIC.count;
    this.cars = [];
    this.time = 0;
    this.threats = [];

    const bodyGeometry = new THREE.BoxGeometry(1.94, 0.6, 4.35);
    bodyGeometry.translate(0, 0.66, 0);
    const cabinGeometry = new THREE.BoxGeometry(1.7, 0.54, 2.0);
    cabinGeometry.translate(0, 1.2, -0.28);
    const skirtGeometry = new THREE.BoxGeometry(1.84, 0.26, 4.24);
    skirtGeometry.translate(0, 0.36, 0);
    const wheelGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 8);
    wheelGeometry.rotateZ(Math.PI / 2);

    this.body = new THREE.InstancedMesh(bodyGeometry, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.45 }), this.count);
    this.skirt = new THREE.InstancedMesh(skirtGeometry, new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.85 }), this.count);
    this.cabin = new THREE.InstancedMesh(cabinGeometry, new THREE.MeshStandardMaterial({ color: 0x1e2c34, roughness: 0.12, metalness: 0.65 }), this.count);
    this.wheels = new THREE.InstancedMesh(wheelGeometry, new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.95 }), this.count * 4);
    const headGeometry = new THREE.BoxGeometry(1.5, 0.13, 0.06);
    headGeometry.translate(0, 0.74, 2.19);
    const tailGeometry = new THREE.BoxGeometry(1.5, 0.12, 0.06);
    tailGeometry.translate(0, 0.76, -2.19);
    this.head = new THREE.InstancedMesh(headGeometry, new THREE.MeshStandardMaterial({
      color: 0xfff1c8, emissive: 0xffd88a, emissiveIntensity: 0.9, roughness: 0.35,
    }), this.count);
    this.tail = new THREE.InstancedMesh(tailGeometry, new THREE.MeshStandardMaterial({
      color: 0xff6a52, emissive: 0xff3a20, emissiveIntensity: 0.8, roughness: 0.4,
    }), this.count);

    // A soft contact patch under every car: the shadow the sun would throw if the sun were softer.
    const patchGeometry = new THREE.PlaneGeometry(1, 1);
    patchGeometry.rotateX(-Math.PI / 2);
    this.patches = new THREE.InstancedMesh(
      patchGeometry,
      new THREE.MeshBasicMaterial({
        map: createContactPatch(), transparent: true, opacity: 0.72, depthWrite: false,
        color: 0x0a1014, toneMapped: false,
      }),
      this.count,
    );
    this.patches.frustumCulled = false;
    this.patches.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.patches.renderOrder = 1;
    scene.add(this.patches);

    for (const mesh of [this.body, this.skirt, this.cabin, this.wheels, this.head, this.tail]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
    }
    this.body.setColorAt(0, new THREE.Color(0xffffff));
    this.body.instanceColor.needsUpdate = true;

    for (let index = 0; index < this.count; index += 1) {
      const car = this.spawnCar(index);
      this.cars.push(car);
      this.body.setColorAt(index, car.colour);
    }
    this.body.instanceColor.needsUpdate = true;
    // Start with the traffic near the player, not spread over all ten kilometres of lane.
    const focus = initialFocus ?? { x: 0, z: 0 };
    for (const car of this.cars) this.stream(car, focus, 130);
    this.writeMatrices();
  }

  /** A fresh car somewhere on the grid, biased to the two central avenues so they look busy. */
  spawnCar(index) {
    const random = this.random;
    const street = this.pickStreet();
    const axis = random() < 0.5 ? 'z' : 'x';
    const dir = random() < 0.5 ? 1 : -1;
    // Half of the fleet starts stacked up the approach to a junction, where a queue belongs.
    let along;
    if (random() < 0.55) {
      const node = 1 + Math.floor(random() * (CITY.cells - 1));
      along = roadCenter(node) - dir * range(random, 7, 84);
    } else {
      along = range(random, -CITY_HALF + 14, CITY_HALF - 14);
    }
    // Keep a gap from anything already on the lane.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const clash = this.cars.some((other) => other.alive
        && other.axis === axis && other.street === street && other.dir === dir
        && Math.abs(other.along - along) < TRAFFIC.gap * 1.8);
      if (!clash) break;
      along = range(random, -CITY_HALF + 14, CITY_HALF - 14);
    }
    return {
      index,
      alive: true,
      axis,
      street,
      dir,
      along,
      lat: laneLat(axis, dir),
      speed: TRAFFIC.cruise * range(random, 0.5, 0.9),
      target: TRAFFIC.cruise,
      heading: headingFor(axis, dir),
      colour: new THREE.Color(pick(random, TRAFFIC_PAINTS)),
      spin: 0,
      length: range(random, 0.92, 1.06),
      stolen: false,
    };
  }

  /** Two thirds of the cars live on the avenues through the middle of the bay. */
  pickStreet() {
    return this.random() < 0.66
      ? (this.random() < 0.5 ? 2 : 3)
      : Math.floor(this.random() * (CITY.cells + 1));
  }

  /** Move a car that has drifted too far from the camera to a lane nearer the action. */
  stream(car, focus, threshold = TRAFFIC.despawn) {
    if (!focus) return;
    const position = this.positionOf(car, TMP);
    if (Math.hypot(position.x - focus.x, position.z - focus.z) < threshold) return;
    const random = this.random;
    const nearStreetX = Math.max(0, Math.min(CITY.cells, Math.round((focus.x + CITY_HALF) / CITY.pitch)));
    const nearStreetZ = Math.max(0, Math.min(CITY.cells, Math.round((focus.z + CITY_HALF) / CITY.pitch)));
    for (let attempt = 0; attempt < 6; attempt += 1) {
      // A replacement car comes back onto the block the player is in, but spread across the lanes
      // around it: piling every car onto one avenue is what turns a busy street into a car park.
      const local = random() < 0.62;
      const axis = local ? (Math.abs(focus.x - roadCenter(nearStreetX)) < Math.abs(focus.z - roadCenter(nearStreetZ)) ? 'z' : 'x')
        : (random() < 0.5 ? 'z' : 'x');
      const near = axis === 'z' ? nearStreetX : nearStreetZ;
      const street = local
        ? Math.max(0, Math.min(CITY.cells, near + Math.round(range(random, -1.4, 1.4))))
        : this.pickStreet();
      const dir = random() < 0.5 ? 1 : -1;
      const along = (axis === 'z' ? focus.z : focus.x) + range(random, -88, 88);
      if (along < -CITY_HALF + 20 || along > CITY_HALF - 20) continue;
      const centre = roadCenter(street);
      const lat = laneLat(axis, dir);
      const x = axis === 'z' ? centre + lat : along;
      const z = axis === 'z' ? along : centre + lat;
      const distance = Math.hypot(x - focus.x, z - focus.z);
      if (distance < 26) continue;
      car.axis = axis;
      car.street = street;
      car.dir = dir;
      car.along = along;
      car.lat = lat;
      car.heading = headingFor(axis, dir);
      car.speed = TRAFFIC.cruise * range(random, 0.7, 1);
      return;
    }
  }

  /** Recompute world position from the lane state. */
  positionOf(car, out = new THREE.Vector3()) {
    const centre = roadCenter(car.street);
    if (car.axis === 'z') out.set(centre + car.lat, 0, car.along);
    else out.set(car.along, 0, centre + car.lat);
    return out;
  }

  /** Green for north-south, red for east-west, offset per junction so the grid is never still. */
  lightIsGreen(axis, nodeIndex, time) {
    const phase = (time + nodeIndex * 3.1) % TRAFFIC.lightCycle;
    const half = TRAFFIC.lightCycle * 0.5;
    return axis === 'z' ? phase < half * 0.92 : phase >= half && phase < TRAFFIC.lightCycle * 0.96;
  }

  update(dt, context) {
    this.time += dt;
    const time = this.time;
    const playerCar = context && context.playerCar;
    const playerPosition = context && context.playerPosition;
    this.threats.length = 0;

    for (const car of this.cars) {
      if (!car.alive) continue;
      this.stream(car, context && context.focus);

      // Draw the car: what is in front of it, and whether the light lets it through.
      const node = nextNode(car.along, car.dir);
      const nodeDistance = car.dir > 0
        ? roadCenter(node) - car.along
        : car.along - roadCenter(node);
      let wanted = TRAFFIC.cruise * (0.82 + 0.18 * Math.sin(car.index * 2.1));

      if (nodeDistance > 0 && nodeDistance < TRAFFIC.stopLine && !this.lightIsGreen(car.axis, node, time)) {
        wanted = Math.min(wanted, Math.max(0, (nodeDistance - 7) * 1.6));
      }

      // Follow the car ahead in this lane.
      let gap = Infinity;
      for (const other of this.cars) {
        if (!other.alive || other === car) continue;
        if (other.axis !== car.axis || other.street !== car.street || other.dir !== car.dir) continue;
        const ahead = (other.along - car.along) * car.dir;
        if (ahead > 0 && ahead < gap) gap = ahead;
      }
      if (gap < TRAFFIC.gap * 2.2) wanted = Math.min(wanted, Math.max(0, (gap - TRAFFIC.gap * 0.9) * 2.4));

      // Yield to the player's car if it is sitting in the lane.
      if (playerCar) {
        const dx = playerCar.position.x - this.positionOf(car, TMP).x;
        const dz = playerCar.position.z - TMP.z;
        const forward = car.axis === 'z' ? dz * car.dir : dx * car.dir;
        const lateral = car.axis === 'z' ? Math.abs(dx) : Math.abs(dz);
        if (forward > 0 && forward < 15 && lateral < 3.2) wanted = Math.min(wanted, Math.max(0, (forward - 5.5) * 1.4));
      }

      const rate = wanted > car.speed ? TRAFFIC.accel : TRAFFIC.brake;
      car.speed += (wanted - car.speed) * Math.min(1, rate * dt * 0.32);
      if (car.speed < 0.05) car.speed = 0;

      car.along += car.dir * car.speed * dt;
      car.spin += car.speed * dt / 0.42;

      // Take the junction: straight on unless there is nowhere left to go, then a turn.
      if (nodeDistance <= 1.6) {
        this.turn(car, node);
      }

      // Keep the lane, easing the lateral offset so corners are curves rather than right angles.
      const targetLat = laneLat(car.axis, car.dir);
      car.lat += (targetLat - car.lat) * Math.min(1, 4.5 * dt);

      const targetHeading = headingFor(car.axis, car.dir);
      car.heading += angleDelta(car.heading, targetHeading) * Math.min(1, 5.5 * dt);

      const position = this.positionOf(car, TMP);
      this.threats.push({ x: position.x, z: position.z, speed: car.speed, heading: car.heading });

      // Bump the player if they are in the road.
      if (playerPosition && !this.claims) {
        const reach = 2.9 + TRAFFIC.laneOffset * 0.0;
        const distance = Math.hypot(playerPosition.x - position.x, playerPosition.z - position.z);
        if (distance < reach && distance > 0.001) {
          const push = (reach - distance) * 0.7;
          playerPosition.x += ((playerPosition.x - position.x) / distance) * push;
          playerPosition.z += ((playerPosition.z - position.z) / distance) * push;
          car.speed *= 0.55;
        }
      }
    }

    this.writeMatrices();
  }

  /**
   * Move a car onto a new lane at junction `node`. A car only takes a lane that has room for it:
   * pulling into a full lane is how a grid locks up, because the car then sits in the box and
   * blocks the crossing traffic that was about to clear it.
   */
  turn(car, node) {
    const options = [];
    const straightNode = node + car.dir;
    if (straightNode >= 0 && straightNode <= CITY.cells) options.push({ axis: car.axis, street: car.street, dir: car.dir });

    const otherAxis = car.axis === 'z' ? 'x' : 'z';
    for (const dir of [1, -1]) {
      const next = car.street + dir;
      if (next < 0 || next > CITY.cells) continue;
      options.push({ axis: otherAxis, street: node, dir });
    }
    if (!options.length) return;

    const position = this.positionOf(car, TMP);
    const clear = [];
    for (const option of options) {
      const along = option.axis === 'z' ? position.z : position.x;
      let blocked = false;
      for (const other of this.cars) {
        if (other === car || !other.alive) continue;
        if (other.axis !== option.axis || other.street !== option.street || other.dir !== option.dir) continue;
        if (Math.abs(other.along - along) < 12) {
          blocked = true;
          break;
        }
      }
      if (!blocked) clear.push({ ...option, along });
    }

    // Nowhere to put the car: hold at the line and let the junction clear.
    if (!clear.length) {
      car.speed = Math.min(car.speed, 2);
      return;
    }

    const random = this.random;
    const straight = clear.find((option) => option.axis === car.axis);
    const choice = straight && random() < 0.42 ? straight : clear[Math.floor(random() * clear.length)];
    if (choice.axis === car.axis) return;

    car.axis = choice.axis;
    car.street = choice.street;
    car.dir = choice.dir;
    car.along = choice.along;
    car.lat = choice.axis === 'z' ? position.x - roadCenter(choice.street) : position.z - roadCenter(choice.street);
    car.speed *= 0.86;
  }

  /** Push every car's parts into the instance buffers. */
  writeMatrices() {
    const dummy = new THREE.Object3D();
    let live = 0;
    for (const car of this.cars) {
      const position = this.positionOf(car, TMP);

      if (!car.alive) {
        dummy.position.set(0, -400, 0);
        dummy.scale.setScalar(0.001);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        this.body.setMatrixAt(car.index, dummy.matrix);
        this.skirt.setMatrixAt(car.index, dummy.matrix);
        this.cabin.setMatrixAt(car.index, dummy.matrix);
        this.head.setMatrixAt(car.index, dummy.matrix);
        this.tail.setMatrixAt(car.index, dummy.matrix);
        for (let wheel = 0; wheel < 4; wheel += 1) this.wheels.setMatrixAt(car.index * 4 + wheel, dummy.matrix);
        this.patches.setMatrixAt(car.index, dummy.matrix);
        continue;
      }

      // The soft contact patch on the asphalt, wider than the tyres and darker in the middle.
      dummy.position.set(position.x, 0.055, position.z);
      dummy.rotation.set(0, car.heading, 0);
      dummy.scale.set(2.7, 1, car.length * 5.2);
      dummy.updateMatrix();
      this.patches.setMatrixAt(car.index, dummy.matrix);

      const cos = Math.cos(car.heading);
      const sin = Math.sin(car.heading);

      dummy.position.set(position.x, 1.2 - 1.2, position.z);
      dummy.rotation.set(0, car.heading, 0);
      dummy.scale.set(1, 1, car.length);
      dummy.updateMatrix();
      this.body.setMatrixAt(car.index, dummy.matrix);
      this.skirt.setMatrixAt(car.index, dummy.matrix);
      this.cabin.setMatrixAt(car.index, dummy.matrix);
      this.head.setMatrixAt(car.index, dummy.matrix);
      this.tail.setMatrixAt(car.index, dummy.matrix);

      for (let wheel = 0; wheel < 4; wheel += 1) {
        const side = wheel % 2 === 0 ? -0.92 : 0.92;
        const front = wheel < 2 ? 1.36 : -1.32;
        dummy.position.set(
          position.x + side * cos + front * sin,
          0.42,
          position.z - side * sin + front * cos,
        );
        dummy.rotation.set(0, car.heading, 0);
        dummy.rotateX(car.spin);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.wheels.setMatrixAt(car.index * 4 + wheel, dummy.matrix);
      }
      live += 1;
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.skirt.instanceMatrix.needsUpdate = true;
    this.cabin.instanceMatrix.needsUpdate = true;
    this.wheels.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
    this.tail.instanceMatrix.needsUpdate = true;
    this.patches.instanceMatrix.needsUpdate = true;
    this.live = live;
  }

  /** Bump a car's paint for a fresh instance colour after a spawn swap. */
  paint(index, colour) {
    this.body.setColorAt(index, colour);
    this.body.instanceColor.needsUpdate = true;
  }

  /** The nearest car the player could pull a door open on. */
  nearestStealable(position, maxDistance = TRAFFIC.stealRadius) {
    let best = null;
    let bestDistance = maxDistance;
    for (const car of this.cars) {
      if (!car.alive) continue;
      const world = this.positionOf(car, new THREE.Vector3());
      const distance = Math.hypot(world.x - position.x, world.z - position.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { car, position: world, heading: car.heading, colour: car.colour };
      }
    }
    return best;
  }

  /** Remove a car from the pool: the player has taken it. */
  take(car) {
    car.alive = false;
    car.stolen = true;
    this.writeMatrices();
  }

  /** Put a new car back into the pool at a lane position (used when a stolen car is abandoned). */
  release(x, z, heading) {
    const car = this.cars.find((entry) => !entry.alive);
    if (!car) return;
    car.alive = true;
    car.axis = Math.abs(Math.sin(heading)) > 0.5 ? 'x' : 'z';
    car.street = Math.max(0, Math.min(CITY.cells, Math.round((car.axis === 'z' ? x : z) + CITY_HALF) / CITY.pitch));
    if (car.axis === 'z') {
      car.along = z;
      car.lat = x - roadCenter(car.street);
    } else {
      car.along = x;
      car.lat = z - roadCenter(car.street);
    }
    car.dir = Math.sin(heading) >= 0 ? 1 : -1;
    car.speed = 0;
    car.target = 0;
    car.heading = heading;
    this.writeMatrices();
  }

  /** A hitscan against the traffic: returns the first car in the line of fire. */
  hitTest(origin, direction, maxDistance) {
    let best = null;
    for (const car of this.cars) {
      if (!car.alive) continue;
      const position = this.positionOf(car, new THREE.Vector3());
      const toCar = new THREE.Vector3(position.x - origin.x, 1.0 - origin.y, position.z - origin.z);
      const along = toCar.dot(direction);
      if (along < 0 || along > maxDistance) continue;
      const closest = new THREE.Vector3().copy(origin).addScaledVector(direction, along);
      const miss = Math.hypot(closest.x - position.x, closest.z - position.z);
      if (miss < 2.0 && (!best || along < best.distance)) best = { car, distance: along };
    }
    return best;
  }

  /** How many cars are on the road: the HUD and the tests read this. */
  get moving() {
    return this.cars.reduce((total, car) => total + (car.alive && car.speed > 0.4 ? 1 : 0), 0);
  }
}

const TMP = new THREE.Vector3();
export { UP };
