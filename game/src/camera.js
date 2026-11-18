// The chase camera: over the walker's shoulder on foot, low and wide behind the car once you
// are driving. Mouse look turns it, and both rigs ease toward their marks so motion reads well.
import * as THREE from '../vendor/three.module.min.js';
import { CAMERA } from './config.js';

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.02;
    this.position = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.ready = false;
  }

  /** Feed the mouse delta straight in, in pixels. */
  look(deltaX, deltaY) {
    this.yaw -= deltaX * CAMERA.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + deltaY * CAMERA.sensitivity, CAMERA.minPitch, CAMERA.maxPitch);
  }

  /** Which way the walker should be looking, in the same convention as the camera. */
  get heading() {
    return this.yaw;
  }

  snap() {
    this.ready = false;
    this.frozen = false;
  }

  /** Pin the camera where a staged screenshot wants it; update() then leaves it alone. */
  freeze(position, lookAt) {
    this.frozen = true;
    this.position.copy(position);
    this.lookAt.copy(lookAt);
    this.camera.position.copy(position);
    this.camera.lookAt(lookAt);
  }

  update(dt, mode, subject) {
    if (this.frozen) return;

    const targetPosition = new THREE.Vector3();
    const targetLook = new THREE.Vector3();
    let wantedFov = CAMERA.fov;

    if (mode === 'car') {
      const forward = subject.forward;
      const speedRatio = Math.abs(subject.speed) / 36;
      const distance = CAMERA.carDistance + speedRatio * 2.2;
      targetPosition.copy(subject.position).addScaledVector(forward, -distance);
      targetPosition.y = subject.position.y + CAMERA.carHeight;
      targetLook.copy(subject.position).addScaledVector(forward, CAMERA.carLookAhead);
      targetLook.y = subject.position.y + 1.3;
      wantedFov = CAMERA.carFov + speedRatio * 4;
    } else {
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const back = CAMERA.footDistance * Math.cos(this.pitch * 0.85);
      targetPosition.copy(subject.position).addScaledVector(forward, -back);
      targetPosition.y = subject.position.y + CAMERA.footHeight + Math.sin(this.pitch) * 3.4;
      targetLook.copy(subject.position).addScaledVector(forward, 5.5);
      targetLook.y = subject.position.y + CAMERA.footLookHeight + Math.sin(this.pitch) * 2.2;
    }

    if (!this.ready) {
      this.position.copy(targetPosition);
      this.lookAt.copy(targetLook);
      this.ready = true;
    } else {
      const ease = 1 - Math.exp(-CAMERA.followLag * dt);
      this.position.lerp(targetPosition, ease);
      this.lookAt.lerp(targetLook, Math.min(1, ease * 1.6));
    }

    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookAt);
    this.camera.fov += (wantedFov - this.camera.fov) * (1 - Math.exp(-CAMERA.fovLag * dt));
    this.camera.updateProjectionMatrix();
  }
}
