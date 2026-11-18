// The wanted level and the units that answer it. Every crime adds stars, every star puts another
// cruiser on the street, and the only way down is to be out of sight long enough.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, CITY_HALF, POLICE, CRIME, roadCenter } from './config.js';
import { Car } from './vehicle.js';
import { groundHeight } from './city.js';

function angleDelta(from, to) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function nearestRoad(value) {
  const index = Math.max(0, Math.min(CITY.cells, Math.round((value + CITY_HALF) / CITY.pitch)));
  return roadCenter(index);
}

export class Police {
  constructor(scene, city, random) {
    this.scene = scene;
    this.city = city;
    this.random = random;
    this.stars = 0;
    this.units = [];
    this.spawnTimer = 0;
    this.crimeTimer = 99;
    this.escapeTimer = 0;
    this.seen = false;
    this.busted = false;
    this.explosions = [];
    this.chaseCount = 0;

    const geometry = new THREE.SphereGeometry(1, 8, 6);
    for (let index = 0; index < 6; index += 1) {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color: 0xffa04a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
      );
      mesh.visible = false;
      scene.add(mesh);
      this.explosions.push({ mesh, life: 0 });
    }
  }

  /** Add stars for a crime. Gunfire in an empty street still counts once. */
  crime(amount, reason) {
    if (amount <= 0) return this.stars;
    const next = Math.min(CRIME.maxStars, this.stars + amount);
    this.stars = next;
    this.crimeTimer = 0;
    this.escapeTimer = 0;
    this.lastCrime = reason ?? 'crime';
    return this.stars;
  }

  setStars(value) {
    this.stars = Math.max(0, Math.min(CRIME.maxStars, Math.round(value)));
    this.crimeTimer = 0;
    this.escapeTimer = 0;
    if (this.stars === 0) this.clearUnits();
  }

  clearUnits() {
    for (const unit of this.units) this.scene.remove(unit.car.group);
    this.units.length = 0;
  }

  /** A junction far enough away that the cruiser arrives rather than appearing on top of you. */
  spawnPoint(around) {
    const candidates = [];
    for (let x = 0; x <= CITY.cells; x += 1) {
      for (let z = 0; z <= CITY.cells; z += 1) {
        const point = { x: roadCenter(x) + POLICE.response * 3, z: roadCenter(z) };
        const distance = Math.hypot(point.x - around.x, point.z - around.z);
        if (distance > 55 && distance < 190) candidates.push({ point, distance });
      }
    }
    if (!candidates.length) return { x: roadCenter(0), z: roadCenter(0) };
    const pick = candidates[Math.floor(this.random() * candidates.length)];
    return pick.point;
  }

  spawn(around) {
    const point = this.spawnPoint(around);
    const car = new Car(this.scene, this.city, { x: point.x, z: point.z, heading: Math.PI }, {
      colour: 0xf2f2ec,
      police: true,
    });
    car.place(point.x, point.z, Math.PI);
    this.units.push({ car, health: 1, fireTimer: 0, unstick: 0, reverse: 0, id: this.chaseCount++ });
    return this.units[this.units.length - 1];
  }

  update(dt, context) {
    const player = context.player;
    const playerCar = context.car;
    const inCar = context.inCar;
    const pos = inCar ? playerCar.position : player.position;

    this.crimeTimer += dt;
    if (this.stars > 0 && this.crimeTimer > CRIME.decayAfter && !this.seen) this.stars = Math.max(0, this.stars - dt * 0.12);

    // Keep as many units on the street as the star level asks for.
    const wanted = Math.min(POLICE.maxUnits, this.stars + (this.stars > 2 ? 1 : 0));
    this.spawnTimer -= dt;
    if (this.units.length < wanted && this.spawnTimer <= 0 && this.stars > 0) {
      this.spawn(pos);
      this.spawnTimer = POLICE.response;
    }
    if (this.units.length > wanted + 1) {
      const gone = this.units.shift();
      this.scene.remove(gone.car.group);
    }

    let closest = Infinity;
    for (const unit of this.units) {
      const car = unit.car;
      const distance = car.distanceTo(pos);
      closest = Math.min(closest, distance);

      // Aim: at the player when close and in sight, otherwise at the junction nearest them, so a
      // cruiser follows the grid instead of trying to drive through a block.
      const aimPlayer = distance < 34;
      let targetX = aimPlayer ? pos.x : nearestRoad(pos.x);
      let targetZ = aimPlayer ? pos.z : nearestRoad(pos.z);
      // If the cruiser has ended up off the carriageway, get it back on the nearest street first.
      const driftX = Math.abs(car.position.x - nearestRoad(car.position.x));
      const driftZ = Math.abs(car.position.z - nearestRoad(car.position.z));
      if (Math.min(driftX, driftZ) > 10) {
        if (driftX < driftZ) targetX = nearestRoad(car.position.x);
        else targetZ = nearestRoad(car.position.z);
      }

      const dx = targetX - car.position.x;
      const dz = targetZ - car.position.z;
      const range = Math.hypot(dx, dz);
      // Pure pursuit: aim at a point a fixed distance ahead, not at the target itself.
      const lookahead = Math.min(range, 13);
      const aimX = car.position.x + (range > 0.01 ? (dx / range) * lookahead : 0);
      const aimZ = car.position.z + (range > 0.01 ? (dz / range) * lookahead : 0);
      const desired = Math.atan2(aimX - car.position.x, aimZ - car.position.z);
      const error = angleDelta(car.heading, desired);
      // The steering model is twitchy at speed: a small input swings the car a long way.
      const steer = Math.max(-0.42, Math.min(0.42, error * 0.32));

      // Slow down for corners and for the last few metres, so they arrive instead of overshooting.
      let wanted = 27;
      if (Math.abs(error) > 1.15) wanted = 7;
      else if (Math.abs(error) > 0.5) wanted = 15;
      if (!aimPlayer && range < 26) wanted = Math.min(wanted, 18);
      if (aimPlayer && distance < 16) wanted = Math.min(wanted, 15);

      let throttle = 0;
      if (car.speed < wanted - 1.5) throttle = 1;
      else if (car.speed > wanted + 1.5) throttle = -1;
      if (distance < 7 && Math.abs(error) < 0.9) throttle = -0.7;
      if (unit.reverse > 0) {
        unit.reverse -= dt;
        throttle = -1;
        unit.unstick = 0;
      }

      // Unstick: a cruiser that has been crawling backs out and tries a different line.
      if (Math.abs(car.speed) < 1.6 && Math.abs(throttle) > 0.5) unit.unstick += dt;
      else unit.unstick = Math.max(0, unit.unstick - dt * 0.8);
      if (unit.unstick > 1.4) {
        unit.reverse = 1.0;
        unit.unstick = 0;
        car.heading += (this.random() < 0.5 ? -1 : 1) * 0.35;
      }

      const control = {
        axisForward: () => throttle,
        axisStrafe: () => steer,
        handbrake: false,
        sprinting: false,
        consumePress: () => false,
      };
      car.update(dt, control, true);

      // Ram the player, or the player's car.
      if (distance < POLICE.ramRadius && Math.abs(car.speed) > 6) {
        context.onRam(POLICE.ramDamage * (inCar ? 0.4 : 1));
        car.speed *= 0.4;
      }

      // Fire when there is a clear line and the player is not already down.
      unit.fireTimer -= dt;
      if (distance < POLICE.shootRange && unit.fireTimer <= 0 && context.isAlive()) {
        unit.fireTimer = POLICE.shootEvery * (0.75 + this.random() * 0.6);
        context.onShot(distance);
      }

      // Cars wreck: a cruiser that has taken enough goes up.
      if (unit.health <= 0) {
        this.explode(car.position);
        this.scene.remove(car.group);
        unit.dead = true;
      }
    }
    this.units = this.units.filter((unit) => !unit.dead);

    // Cops see you when they are close, and lose you when they are not.
    this.seen = closest < 62;
    if (this.seen) this.escapeTimer = 0;
    else if (this.stars > 0) {
      this.escapeTimer += dt;
      if (this.escapeTimer > POLICE.escapeTime) {
        this.escapeTimer = 0;
        this.stars = Math.max(0, this.stars - 1);
      }
    }

    for (const blast of this.explosions) {
      if (blast.life <= 0) continue;
      blast.life -= dt;
      blast.mesh.material.opacity = Math.max(0, blast.life / 0.8) * 0.9;
      blast.mesh.scale.setScalar(1 + (0.8 - blast.life) * 9);
      if (blast.life <= 0) blast.mesh.visible = false;
    }
  }

  explode(position) {
    const slot = this.explosions.find((entry) => entry.life <= 0) ?? this.explosions[0];
    slot.mesh.position.copy(position).setY(1.4);
    slot.mesh.scale.setScalar(1);
    slot.mesh.material.opacity = 0.9;
    slot.mesh.visible = true;
    slot.life = 0.8;
  }

  /** A hitscan against the cruisers. */
  hitTest(origin, direction, maxDistance) {
    let best = null;
    for (const unit of this.units) {
      const car = unit.car;
      const toCar = new THREE.Vector3(car.position.x - origin.x, 1.0 - origin.y, car.position.z - origin.z);
      const along = toCar.dot(direction);
      if (along < 0.5 || along > maxDistance) continue;
      const closest = new THREE.Vector3().copy(origin).addScaledVector(direction, along);
      const miss = Math.hypot(closest.x - car.position.x, closest.z - car.position.z);
      if (miss < 2.2 && (!best || along < best.distance)) best = { unit, distance: along };
    }
    return best;
  }

  nearest(position) {
    let best = null;
    let bestDistance = Infinity;
    for (const unit of this.units) {
      const distance = unit.car.distanceTo(position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = unit;
      }
    }
    return { unit: best, distance: bestDistance };
  }

  get active() {
    return this.units.length;
  }

  /** Put a cruiser where a staged screenshot wants it, already moving. */
  place(index, x, z, heading, speed = 20) {
    while (this.units.length <= index) this.spawn({ x, z });
    const car = this.units[index].car;
    car.place(x, z, heading);
    car.speed = speed;
    return car;
  }

  reset() {
    this.stars = 0;
    this.crimeTimer = 99;
    this.escapeTimer = 0;
    this.clearUnits();
  }
}
