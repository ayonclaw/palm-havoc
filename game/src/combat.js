// The pistol and everything it does: hitscan down the crosshair, tracers, impact sparks, the
// magazine, the reload beat, and the player's health.
import * as THREE from '../vendor/three.module.min.js';
import { GUN } from './config.js';

const TRACER_COUNT = 14;

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.health = 1;
    this.maxHealth = 1;
    this.ammo = GUN.magazine;
    this.reloadTimer = 0;
    this.cooldown = 0;
    this.firing = 0;
    this.shots = 0;
    this.hits = 0;
    this.kills = 0;
    this.muzzleTimer = 0;
    this.lastDamage = 99;

    this.tracers = [];
    const tracerGeometry = new THREE.CylinderGeometry(0.035, 0.035, 1, 5, 1, true);
    tracerGeometry.translate(0, 0.5, 0);
    for (let index = 0; index < TRACER_COUNT; index += 1) {
      const mesh = new THREE.Mesh(
        tracerGeometry,
        new THREE.MeshBasicMaterial({ color: 0xffe1a0, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
      );
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.tracers.push({ mesh, life: 0 });
    }

    this.sparks = [];
    const sparkGeometry = new THREE.SphereGeometry(0.18, 6, 5);
    for (let index = 0; index < 10; index += 1) {
      const mesh = new THREE.Mesh(
        sparkGeometry,
        new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
      );
      mesh.visible = false;
      scene.add(mesh);
      this.sparks.push({ mesh, life: 0 });
    }

    this.muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd79a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    this.muzzle.visible = false;
    scene.add(this.muzzle);

    // The gun in the player's hand: a dark block that swings up when it fires.
    this.weapon = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.4, metalness: 0.8 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.85 });
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.42), steel);
    barrel.position.set(0, 0, 0.16);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), grip);
    handle.position.set(0, -0.14, -0.02);
    this.weapon.add(barrel, handle);
    this.weapon.visible = false;
    scene.add(this.weapon);
    this.weaponKick = 0;
  }

  get reloading() {
    return this.reloadTimer > 0;
  }

  /** True when the trigger would do something right now. */
  canFire() {
    return this.cooldown <= 0 && this.reloadTimer <= 0 && this.ammo > 0;
  }

  startReload() {
    if (this.reloadTimer > 0 || this.ammo === GUN.magazine) return false;
    this.reloadTimer = GUN.reloadTime;
    return true;
  }

  /**
   * Fire down a ray. `targets` holds the walkers, the police and the traffic; the nearest of the
   * three is the one that takes it. Returns a description for the sound and the wanted level.
   */
  fire(origin, direction, targets) {
    if (!this.canFire()) {
      if (this.ammo === 0 && this.reloadTimer <= 0) this.startReload();
      return null;
    }
    this.cooldown = GUN.fireDelay;
    this.ammo -= 1;
    this.shots += 1;
    this.muzzleTimer = 0.06;

    const pedHit = targets.pedestrians ? targets.pedestrians.hitTest(origin, direction, GUN.range) : null;
    const copHit = targets.police ? targets.police.hitTest(origin, direction, GUN.range) : null;
    const trafficHit = targets.traffic ? targets.traffic.hitTest(origin, direction, GUN.range) : null;

    let best = null;
    if (pedHit) best = { kind: 'pedestrian', distance: pedHit.distance, person: pedHit.person };
    if (copHit && (!best || copHit.distance < best.distance)) best = { kind: 'police', distance: copHit.distance, unit: copHit.unit };
    if (trafficHit && (!best || trafficHit.distance < best.distance)) best = { kind: 'car', distance: trafficHit.distance, car: trafficHit.car };

    const end = origin.clone().addScaledVector(direction, best ? best.distance : GUN.range * 0.75);
    this.tracer(origin, end);
    this.spark(end);

    if (best) {
      this.hits += 1;
      if (best.kind === 'pedestrian' && targets.pedestrians.kill(best.person)) this.kills += 1;
      else if (best.kind === 'police') best.unit.health -= GUN.damage * 0.5;
      else if (best.kind === 'car') best.car.speed *= 0.5;
    }
    if (this.ammo === 0) this.startReload();
    return best ?? { kind: 'miss', distance: GUN.range * 0.75 };
  }

  tracer(from, to) {
    const slot = this.tracers.find((entry) => entry.life <= 0) ?? this.tracers[0];
    const mesh = slot.mesh;
    const direction = new THREE.Vector3().subVectors(to, from);
    const length = direction.length();
    if (length < 0.2) return;
    mesh.position.copy(from);
    mesh.scale.set(1, length, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    mesh.material.opacity = 0.9;
    mesh.visible = true;
    slot.life = 0.08;
  }

  spark(at) {
    const slot = this.sparks.find((entry) => entry.life <= 0) ?? this.sparks[0];
    slot.mesh.position.copy(at);
    slot.mesh.scale.setScalar(1);
    slot.mesh.material.opacity = 0.95;
    slot.mesh.visible = true;
    slot.life = 0.12;
  }

  /** Take a hit. Returns true if this one put the player down. */
  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    this.lastDamage = 0;
    return this.health <= 0;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  reset() {
    this.health = 1;
    this.ammo = GUN.magazine;
    this.reloadTimer = 0;
    this.cooldown = 0;
  }

  update(dt, holder) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.lastDamage += dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0;
        this.ammo = GUN.magazine;
      }
    }
    this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);
    this.firing = Math.max(0, this.firing - dt * 5);
    this.muzzle.visible = this.muzzleTimer > 0;

    for (const slot of this.tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.mesh.material.opacity = Math.max(0, slot.life / 0.08) * 0.9;
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    for (const slot of this.sparks) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.mesh.material.opacity = Math.max(0, slot.life / 0.12);
      slot.mesh.scale.setScalar(1 + (0.12 - slot.life) * 22);
      if (slot.life <= 0) slot.mesh.visible = false;
    }

    if (holder) {
      this.weapon.visible = true;
      this.weaponKick = Math.max(0, this.weaponKick - dt * 6);
      const cos = Math.cos(holder.heading);
      const sin = Math.sin(holder.heading);
      this.weapon.position.set(
        holder.position.x + cos * 0.42 + sin * 0.42,
        holder.position.y + 1.24 - this.weaponKick * 0.06,
        holder.position.z - sin * 0.42 + cos * 0.42,
      );
      this.weapon.rotation.set(-0.15 - this.weaponKick * 0.5, holder.heading, 0);
    } else {
      this.weapon.visible = false;
    }
  }

  /** Kick the weapon and drop the muzzle flash at the end of it. */
  kick(origin) {
    this.weaponKick = 1;
    this.muzzle.position.copy(origin);
  }
}
