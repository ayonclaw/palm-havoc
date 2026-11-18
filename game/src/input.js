// Keyboard and mouse. Keys are tracked by code, so the layout does not matter; pointer lock
// gives the camera its mouse look, and the look delta is drained once a frame.

const HELD = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'KeyF', 'KeyR', 'KeyH',
]);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.locked = false;
    this.buttons = 0;

    window.addEventListener('keydown', (event) => {
      if (HELD.has(event.code)) event.preventDefault();
      if (!event.repeat) this.pressed.add(event.code);
      this.keys.add(event.code);
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons = 0;
    });
    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) this.buttons += 1;
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.buttons = 0;
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    document.addEventListener('mousemove', (event) => {
      if (!this.locked) return;
      this.lookX += event.movementX;
      this.lookY += event.movementY;
    });
  }

  /** Left button held: the pistol fires on a timer while this is true. */
  get mouseDown() {
    return this.buttons > 0;
  }

  /** Ask the browser for the mouse; resolves once the pointer is locked or the wait is over. */
  requestLock() {
    const result = this.canvas.requestPointerLock?.();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  }

  /** -1 back, 1 forward. */
  axisForward() {
    const forward = this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0;
    const back = this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0;
    return forward - back;
  }

  /** -1 left, 1 right. */
  axisStrafe() {
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0;
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0;
    return right - left;
  }

  get sprinting() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  get handbrake() {
    return this.keys.has('Space');
  }

  /** True the first time `code` is asked about since it went down. */
  consumePress(code) {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  /** Take the mouse delta gathered since the last call. */
  takeLook() {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  endFrame() {
    this.pressed.clear();
  }
}
