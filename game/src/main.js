// Palm Havoc — boot, the frame loop, and the state the whole city hangs off: the walker, the car
// you are driving, and every system that moves around them.
import * as THREE from '../vendor/three.module.min.js';
import { blockCenter, roadCenter, CRIME, START_CASH } from './config.js';
import { makeRandom, hashSeed } from './rng.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { Player } from './player.js';
import { Car } from './vehicle.js';
import { ChaseCamera } from './camera.js';
import { createWorld } from './world.js';
import { buildCity, groundHeight, pushOutOfBoxes } from './city.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { loadSave, writeSave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = params.get('seed') || 'marisol';

const canvas = document.getElementById('view');
const bootPanel = document.getElementById('boot');
const startButton = document.getElementById('start-button');
const introOverlay = document.getElementById('intro');

const world = createWorld(canvas);
const city = buildCity(world.scene, makeRandom(hashSeed(seed)));
const player = new Player(world.scene, city);
let car = new Car(world.scene, city, { x: roadCenter(3) + 6.4, z: blockCenter(2) - 6, heading: Math.PI });
const traffic = new Traffic(world.scene, city, makeRandom(hashSeed(`${seed}-traffic`)), { x: 52, z: 52 });
const pedestrians = new Pedestrians(world.scene, city, makeRandom(hashSeed(`${seed}-crowd`)));
const police = new Police(world.scene, city, makeRandom(hashSeed(`${seed}-police`)));
const combat = new Combat(world.scene);
const audio = new Audio();
const rig = new ChaseCamera(world.camera);
const hud = new Hud();
const input = new Input(canvas);

let mode = 'foot';
let running = false;
let paused = false;
let lastTime = 0;
let time = 0;
let wastedTimer = 0;
let lastCrimeSound = 0;
let stoleCarFlag = false;
let promptClock = 0;

// The player arrives with money in their pocket: the same number the save and the HUD carry.
const existing = loadSave();
let cash = existing && Number.isFinite(existing.cash) ? existing.cash : START_CASH;

const parked = [car];

player.position.set(blockCenter(2) + 37, 0, blockCenter(2) + 26);
player.position.y = groundHeight(player.position.x, player.position.z);
player.mesh.position.copy(player.position);
const toCarX = car.position.x - player.position.x;
const toCarZ = car.position.z - player.position.z;
player.facing = Math.atan2(toCarX, toCarZ);
player.mesh.rotation.y = player.facing;
rig.yaw = Math.atan2(-toCarX, -toCarZ);
rig.snap();

const missions = new Missions({
  scene: world.scene,
  hud,
  audio,
  player,
  police,
  pedestrians,
  landmarks: city.landmarks,
  getCar: () => car,
  inCar: () => mode === 'car',
  cash,
  save: () => persist(),
});

const boot = {
  show() {
    bootPanel.classList.remove('dismissed');
  },
  hide() {
    bootPanel.classList.add('dismissed');
  },
};

/** Write the three things the save is for: money, mission progress, wanted level. */
function persist() {
  writeSave({
    cash: missions.cash,
    stars: police.stars,
    missions: missions.snapshot(),
  });
}

/** One tick of the world: everything that moves, in the order it has to move. */
function step(dt, controls, activeMode) {
  time += dt;
  const driving = activeMode === 'car';

  if (driving) {
    car.update(dt, controls, true);
    player.setVisible(false);
  } else {
    car.update(dt, controls, false);
    player.update(dt, controls, rig.yaw);
  }

  traffic.update(dt, {
    playerCar: driving ? car : null,
    playerPosition: driving ? null : player.position,
    focus: driving ? car.position : player.position,
  });
  pedestrians.update(dt, {
    threats: traffic.threats,
    focus: driving ? null : player.position,
  });

  police.update(dt, {
    player,
    car,
    inCar: driving,
    isAlive: () => combat.health > 0 && wastedTimer <= 0,
    onRam: (damage) => {
      if (combat.damage(damage)) kill();
      audio.thud();
    },
    onShot: (distance) => {
      const from = police.nearest(driving ? car.position : player.position).unit;
      const muzzle = from
        ? from.car.position.clone().setY(1.2)
        : new THREE.Vector3(player.position.x, 1.4, player.position.z);
      const target = (driving ? car.position : player.position).clone().setY(1.1);
      combat.tracer(muzzle, target);
      if (Math.random() < 0.55) {
        if (combat.damage(driving ? 0.03 : 0.055)) kill();
        audio.burst(0.09, 1400, 0.3, 'bandpass', 1.2);
      } else {
        audio.burst(0.12, 2200, 0.16, 'highpass', 1);
      }
    },
  });

  combat.update(dt, driving ? null : player);
  missions.update(dt);
  city.landmarks.tick(dt, time);
  if (city.water) city.water.tick(dt, time, world.camera.position);

  // The player's car shoves traffic, and traffic shoves it back.
  if (driving) {
    for (const trafficCar of traffic.cars) {
      if (!trafficCar.alive) continue;
      const spot = traffic.positionOf(trafficCar, TMP_VEC);
      const distance = Math.hypot(car.position.x - spot.x, car.position.z - spot.z);
      if (distance < 3.6 && distance > 0.001) {
        const nx = (car.position.x - spot.x) / distance;
        const nz = (car.position.z - spot.z) / distance;
        const push = (3.6 - distance) * 0.5;
        if (Math.abs(car.speed) > Math.abs(trafficCar.speed)) {
          // The heavier car wins: the traffic car is shoved off its line and knocked dead.
          car.position.x += nx * push * 0.25;
          car.position.z += nz * push * 0.25;
          car.speed *= Math.max(0, 1 - 0.9 * dt);
          trafficCar.speed = Math.max(0, trafficCar.speed * 0.2);
          trafficCar.lat += (trafficCar.axis === 'z' ? nx : nz) * push * 0.8;
        } else {
          car.position.x += nx * push;
          car.position.z += nz * push;
          car.speed *= Math.max(0, 1 - 2.2 * dt);
          trafficCar.speed *= 0.7;
        }
        if (Math.abs(car.speed) > 4) audio.burst(0.1, 380, 0.35, 'lowpass', 1);
      }
    }

    for (const person of pedestrians.people) {
      if (person.dead) continue;
      const distance = Math.hypot(car.position.x - person.x, car.position.z - person.z);
      if (distance < 2.1 && Math.abs(car.speed) > 5) {
        pedestrians.kill(person);
        police.crime(CRIME.pedestrianHit, 'hit and run');
        audio.thud();
        car.speed *= 0.9;
      }
    }
  } else {
    for (const trafficCar of traffic.cars) {
      if (!trafficCar.alive) continue;
      const spot = traffic.positionOf(trafficCar, TMP_VEC);
      if (Math.hypot(player.position.x - spot.x, player.position.z - spot.z) < 1.6 && trafficCar.speed > 8) {
        if (combat.damage(0.3)) kill();
        audio.thud();
        trafficCar.speed *= 0.4;
      }
    }
  }

  if (wastedTimer > 0) {
    wastedTimer -= dt;
    if (wastedTimer <= 0) respawn();
  }

  const subject = driving ? car : player;
  rig.update(dt, activeMode, subject);
  world.follow(subject.position);
}

const TMP_VEC = new THREE.Vector3();

/** Down and out: the bay charges for the hospital and takes a slice of the cash. */
function kill() {
  if (wastedTimer > 0) return;
  wastedTimer = 4.2;
  combat.damage(1);
  audio.tone(180, 1.2, 0.3, 'sawtooth', 60);
  hud.say('MARISOL BAY', 'Wasted. The clinic takes what it is owed.', 3.4);
  hud.setHealth(0);
}

function respawn() {
  mode = 'foot';
  car.occupied = false;
  player.setVisible(true);
  stealFlagReset();
  player.position.set(roadCenter(1) + 6, 0, roadCenter(1) + 6);
  player.position.y = groundHeight(player.position.x, player.position.z);
  player.velocity.set(0, 0, 0);
  player.mesh.position.copy(player.position);
  combat.reset();
  hud.setHealth(1);
  police.reset();
  missions.cash = Math.max(0, Math.round(missions.cash * 0.9));
  persist();
  rig.snap();
}

function stealFlagReset() {
  stoleCarFlag = false;
}

/** E at the kerb: get into the nearest traffic car, or the one already parked. */
function tryEnterCar() {
  if (mode !== 'foot') return false;
  const nearest = traffic.nearestStealable(player.position);
  if (nearest) {
    traffic.take(nearest.car);
    const stolen = new Car(world.scene, city, {
      x: nearest.position.x,
      z: nearest.position.z,
      heading: nearest.heading,
    }, { colour: `#${nearest.colour.getHexString()}` });
    stolen.speed = Math.max(nearest.car.speed * 0.6, 0);
    car = stolen;
    parked.push(stolen);
    if (parked.length > 5) {
      const old = parked.shift();
      if (old !== car) world.scene.remove(old.group);
    }
    mode = 'car';
    car.occupied = true;
    player.setVisible(false);
    player.velocity.set(0, 0, 0);
    police.crime(CRIME.theft, 'grand theft auto');
    hud.toast('Car stolen');
    audio.pickup();
    missions.stole();
    stoleCarFlag = true;
    rig.snap();
    persist();
    return true;
  }
  if (car.distanceTo(player.position) > 5.5) return false;
  mode = 'car';
  car.occupied = true;
  player.setVisible(false);
  player.velocity.set(0, 0, 0);
  rig.snap();
  return true;
}

/** E while driving: step out on the driver's side, clear of the door. */
function tryLeaveCar() {
  if (mode !== 'car') return false;
  mode = 'foot';
  car.occupied = false;
  car.speed *= 0.2;
  const right = new THREE.Vector3(-Math.cos(car.heading), 0, Math.sin(car.heading));
  const spot = car.position.clone().addScaledVector(right, 2.6);
  const corrected = pushOutOfBoxes(city.colliders, spot.x, spot.z, 0.42);
  player.position.set(corrected.x, groundHeight(corrected.x, corrected.z), corrected.z);
  player.velocity.set(0, 0, 0);
  player.mesh.position.copy(player.position);
  player.setVisible(true);
  rig.snap();
  return true;
}

/** The trigger: a ray down the middle of the screen, tracer, noise, and a city that reacts. */
function shoot() {
  if (wastedTimer > 0) return null;
  if (mode === 'car') return null;
  const origin = world.camera.position.clone();
  const direction = new THREE.Vector3();
  world.camera.getWorldDirection(direction);
  const chest = player.position.clone().setY(player.position.y + 1.28);
  const muzzle = chest.clone().addScaledVector(direction, 0.7);
  const result = combat.fire(origin, direction, { pedestrians, police, traffic });
  if (result) {
    combat.kick(muzzle);
    audio.shot();
    pedestrians.scatter(player.position, 30, 6);
    if (time - lastCrimeSound > 2.5) {
      police.crime(CRIME.gunfire, 'discharging a firearm');
      audio.wanted(police.stars);
      lastCrimeSound = time;
    }
    if (result.kind === 'pedestrian') {
      hud.toast('Assault');
      police.crime(CRIME.assault, 'assault');
    }
  }
  return result;
}

const game = {
  world,
  city,
  camera: world.camera,
  player,
  get car() {
    return car;
  },
  traffic,
  pedestrians,
  police,
  combat,
  missions,
  audio,
  rig,
  hud,
  boot,
  input,
  step,
  shoot,
  tickPrompts: updatePrompts,
  get mode() {
    return mode;
  },
  setMode(next) {
    mode = next;
    car.occupied = next === 'car';
    player.setVisible(next !== 'car');
  },
  enterCar: tryEnterCar,
  leaveCar: tryLeaveCar,
  saveNow: () => persist(),
  get time() {
    return time;
  },
  teleport(x, z, heading = 0) {
    if (mode === 'car') car.place(x, z, heading);
    else {
      player.position.set(x, groundHeight(x, z), z);
      player.velocity.set(0, 0, 0);
      player.mesh.position.copy(player.position);
    }
    rig.snap();
  },
  hudState() {
    return {
      mode,
      player,
      car,
      combat,
      cameraYaw: rig.yaw,
      stars: police.stars,
      pedestrians,
      police,
      waypoint: missions.waypoint,
    };
  },
};

startButton.textContent = 'Click to play';
startButton.disabled = false;

hud.setCash(cash);

if (shotName) {
  stageShot(shotName, game);
  running = false;
  lastTime = 0;
}

function begin() {
  if (running) return;
  running = true;
  boot.hide();
  hud.show();
  input.requestLock();
  audio.unlock();
  lastTime = 0;

  if (existing && existing.missions && existing.missions.introSeen) {
    missions.restore({ ...existing.missions, cash: cash });
    if (existing.stars) police.setStars(existing.stars);
    hud.toast('Save loaded');
  } else {
    missions.start();
  }
}

startButton.addEventListener('click', begin);
window.addEventListener('keydown', (event) => {
  if (introOverlay.classList.contains('visible') && (event.code === 'Enter' || event.code === 'Space')) {
    event.preventDefault();
    hud.advanceIntro();
    return;
  }
  if (!running && (event.code === 'Enter' || event.code === 'Space')) {
    event.preventDefault();
    begin();
    return;
  }
  // Tab holds the whole control list; Escape closes it before it frees the mouse.
  if (event.code === 'Tab') {
    event.preventDefault();
    togglePause();
    return;
  }
  if (event.code === 'Escape' && paused) {
    togglePause();
  }
});

/** The controls card freezes the street while it is up. */
function togglePause() {
  if (!running) return;
  paused = !paused;
  hud.setPause(paused);
  hud.dismissPrompt();
  if (paused) {
    document.exitPointerLock?.();
  } else {
    input.requestLock();
    audio.resume();
    lastTime = 0;
  }
}
introOverlay.addEventListener('click', () => hud.advanceIntro());
canvas.addEventListener('click', () => {
  if (running && !input.locked) {
    input.requestLock();
    audio.resume();
  }
});
window.addEventListener('beforeunload', persist);

const SHOWN = new Set();
let lastPromptedCar = undefined;
let promptCooldown = 0;

/**
 * Contextual prompts, not a permanent key strip: the first few seconds point at walking, and after
 * that the HUD only speaks when the player is next to something they could act on. Everything it
 * says is in the Tab card as well, so nothing is ever lost.
 */
function updatePrompts(dt) {
  promptClock += dt;
  promptCooldown = Math.max(0, promptCooldown - dt);
  if (mode === 'foot' && promptCooldown <= 0) {
    const near = traffic.nearestStealable(player.position, 6.5);
    // Once per car, and never twice in a row: a prompt that pulses at a parked car forever is
    // the same tell as a permanent hint strip.
    if (near && near.car !== lastPromptedCar) {
      lastPromptedCar = near.car;
      promptCooldown = 11;
      hud.prompt('E', 'Steal this car', 2.2);
      return;
    }
  }
  if (mode === 'car' && Math.abs(car.speed) < 1.5) {
    if (!SHOWN.has('exit')) {
      SHOWN.add('exit');
      hud.prompt('E', 'Step out', 2.6);
      return;
    }
  }
  if (!combat.reloading && combat.ammo === 0) {
    hud.prompt('R', 'Reload', 1.8);
    return;
  }
  if (promptClock < 3.6 && !SHOWN.has('walk')) {
    SHOWN.add('walk');
    hud.prompt('W A S D', 'Walk the bay', 2.6);
    return;
  }
  if (promptClock > 4.2 && promptClock < 7.4 && !SHOWN.has('sprint')) {
    SHOWN.add('sprint');
    hud.prompt('SHIFT', 'Hold to run', 2.2);
    return;
  }
  if (police.stars > 0 && !SHOWN.has('run') && promptClock < 30) {
    SHOWN.add('run');
    hud.prompt('GAS', 'Lose them', 2.0);
  }
}

const FIXED_STEP = 1 / 60;
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = lastTime ? Math.min(0.25, (now - lastTime) / 1000) : FIXED_STEP;
  lastTime = now;

  if (running && paused) {
    hud.update(dt, game.hudState());
  } else if (running) {
    const look = input.takeLook();
    rig.look(look.x, look.y);
    if (input.consumePress('KeyE')) {
      if (mode === 'foot') tryEnterCar();
      else tryLeaveCar();
    }
    if (input.consumePress('KeyF') || (input.mouseDown && combat.canFire())) shoot();
    if (input.consumePress('KeyR')) combat.startReload();
    if (input.consumePress('KeyH')) {
      // Horn: the city answers, and so do the walkers.
      audio.tone(320, 0.3, 0.12, 'square', 280);
      pedestrians.scatter(player.position, 14, 1.4);
    }
    accumulator = Math.min(accumulator + dt, 0.3);
    while (accumulator >= FIXED_STEP) {
      step(FIXED_STEP, input, mode);
      accumulator -= FIXED_STEP;
    }
    hud.update(dt, game.hudState());
    hud.setHealth(combat.health);
    audio.update(dt, { speed: car.speed, driving: mode === 'car', wanted: police.stars });
    if (missions.cash !== hud.cash) hud.setCash(missions.cash);
    updatePrompts(dt);
  }

  if (city.water) city.water.setCamera(world.camera.position);
  world.render();
  input.endFrame();
}

requestAnimationFrame(frame);

// A small handle for the screenshot tool and for poking at a running build from the console.
window.palmHavoc = {
  scene: world.scene,
  camera: world.camera,
  renderer: world.renderer,
  city,
  player,
  get car() {
    return car;
  },
  traffic,
  pedestrians,
  police,
  combat,
  missions,
  hud,
  rig,
  game,
  mode: () => mode,
  seed,
  ready: true,
};
