// The walker: a small stylised figure built from primitives, and the physics of moving it
// about the pavements with WASD while the mouse steers the camera.
import * as THREE from '../vendor/three.module.min.js';
import { PLAYER, DRESS, CITY_HALF, OCEAN } from './config.js';
import { groundHeight, pushOutOfBoxes } from './city.js';

function box(width, height, depth, color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.75 }),
  );
}

function limb(radius, length, color) {
  return new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, length, 4, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.72 }),
  );
}

/** The figure: hips, swinging legs, a torso, arms and a head. Height is about 1.9 metres. */
function buildWalker() {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: DRESS.skin, roughness: 0.68 });

  const legPivotLeft = new THREE.Group();
  legPivotLeft.position.set(-0.14, 0.92, 0);
  const legLeft = limb(0.115, 0.5, DRESS.trousers);
  legLeft.position.y = -0.42;
  legPivotLeft.add(legLeft);
  const shoeLeft = box(0.22, 0.12, 0.34, DRESS.shoes);
  shoeLeft.position.set(0, -0.88, 0.06);
  legPivotLeft.add(shoeLeft);

  const legPivotRight = legPivotLeft.clone();
  legPivotRight.position.x = 0.14;

  const torso = box(0.56, 0.62, 0.32, DRESS.shirt);
  torso.position.y = 1.26;
  const shoulders = limb(0.21, 0.16, DRESS.shirt);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.position.y = 1.52;
  shoulders.scale.set(1, 1, 0.82);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.08, 10), new THREE.MeshStandardMaterial({ color: 0xf3ece0, roughness: 0.8 }));
  collar.position.y = 1.63;
  const hip = box(0.5, 0.16, 0.3, DRESS.trousers);
  hip.position.y = 0.94;
  const belt = box(0.52, 0.06, 0.32, 0x2a2320);
  belt.position.y = 1.02;

  const armPivotLeft = new THREE.Group();
  armPivotLeft.position.set(-0.33, 1.5, 0);
  const armLeft = limb(0.082, 0.34, DRESS.shirt);
  armLeft.position.y = -0.26;
  const forearmLeft = limb(0.072, 0.16, DRESS.skin);
  forearmLeft.position.y = -0.56;
  const handLeft = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), skin);
  handLeft.position.y = -0.68;
  armPivotLeft.add(armLeft);
  armPivotLeft.add(forearmLeft);
  armPivotLeft.add(handLeft);

  const armPivotRight = armPivotLeft.clone();
  armPivotRight.position.x = 0.33;

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.12, 8), skin);
  neck.position.y = 1.65;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.185, 18, 14), skin);
  head.position.y = 1.79;
  head.scale.set(1, 1.14, 1.04);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.193, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
    new THREE.MeshStandardMaterial({ color: DRESS.hair, roughness: 0.9 }),
  );
  hair.position.y = 1.8;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), skin);
  nose.position.set(0, 1.78, 0.175);

  group.add(legPivotLeft, legPivotRight, torso, shoulders, collar, hip, belt, armPivotLeft, armPivotRight, neck, head, hair, nose);
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return {
    group,
    limbs: { legPivotLeft, legPivotRight, armPivotLeft, armPivotRight, torso, head },
  };
}

export class Player {
  constructor(scene, city) {
    const built = buildWalker();
    this.mesh = built.group;
    this.limbs = built.limbs;
    this.city = city;
    this.position = new THREE.Vector3(city.spawn.x, 0, city.spawn.z);
    this.position.y = groundHeight(this.position.x, this.position.z);
    this.velocity = new THREE.Vector3();
    this.facing = 0;
    this.stride = 0;
    this.speed = 0;
    this.walkBlend = 0;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.facing;
    scene.add(this.mesh);
  }

  /** Move with the camera: WASD is relative to where the player is looking. */
  update(dt, input, cameraYaw) {
    const forward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    const right = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
    const wish = new THREE.Vector3()
      .addScaledVector(forward, input.axisForward())
      .addScaledVector(right, input.axisStrafe());

    const wanted = wish.lengthSq() > 0 ? wish.normalize() : wish;
    const topSpeed = input.sprinting ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const target = wanted.multiplyScalar(topSpeed);

    const blend = Math.min(1, PLAYER.acceleration * dt / Math.max(0.001, topSpeed));
    this.velocity.x += (target.x - this.velocity.x) * blend;
    this.velocity.z += (target.z - this.velocity.z) * blend;
    if (wanted.lengthSq() === 0) {
      const drag = Math.max(0, 1 - PLAYER.drag * dt);
      this.velocity.x *= drag;
      this.velocity.z *= drag;
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    const corrected = pushOutOfBoxes(this.city.colliders, this.position.x, this.position.z, PLAYER.radius);
    this.position.x = corrected.x;
    this.position.z = corrected.z;

    const limit = CITY_HALF + 26;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -limit, limit);
    this.position.z = THREE.MathUtils.clamp(this.position.z, OCEAN.beachEnd + 14, limit);

    const floor = groundHeight(this.position.x, this.position.z);
    this.position.y += (floor - this.position.y) * Math.min(1, 14 * dt);

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.speed > 0.15) {
      const wantedFacing = Math.atan2(this.velocity.x, this.velocity.z);
      let difference = wantedFacing - this.facing;
      while (difference > Math.PI) difference -= Math.PI * 2;
      while (difference < -Math.PI) difference += Math.PI * 2;
      this.facing += difference * Math.min(1, 12 * dt);
    }

    this.walkBlend += ((this.speed > 0.3 ? 1 : 0) - this.walkBlend) * Math.min(1, 8 * dt);
    this.stride += this.speed * dt * 2.4;
    this.animate();

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.facing;
  }

  animate() {
    const swing = Math.sin(this.stride * 2) * 0.62 * this.walkBlend;
    const bounce = Math.abs(Math.sin(this.stride * 2)) * 0.045 * this.walkBlend;
    this.limbs.legPivotLeft.rotation.x = swing;
    this.limbs.legPivotRight.rotation.x = -swing;
    this.limbs.armPivotLeft.rotation.x = -swing * 0.8;
    this.limbs.armPivotRight.rotation.x = swing * 0.8;
    this.limbs.torso.position.y = 1.27 + bounce;
    this.limbs.head.position.y = 1.79 + bounce;
    this.limbs.torso.rotation.y = swing * 0.08;
  }

  setVisible(visible) {
    this.mesh.visible = visible;
  }
}
