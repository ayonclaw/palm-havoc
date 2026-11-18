// The four scenes behind ?shot=vista|street|chase|mission. Each one sets up the same world the
// player gets, lets the real rules run forward long enough for the traffic to gather and the crowd
// to fill the pavements, and then leaves the camera where a photographer would stand. Same seed,
// same picture: no shot is staged by teleporting cars into place.
import * as THREE from '../vendor/three.module.min.js';
import { roadCenter, blockCenter, OCEAN } from './config.js';
import { groundHeight } from './city.js';

const STEP = 1 / 60;

const IDLE = {
  axisForward: () => 0,
  axisStrafe: () => 0,
  sprinting: false,
  handbrake: false,
  consumePress: () => false,
  endFrame: () => {},
};

const THROTTLE = { ...IDLE, axisForward: () => 1 };

function run(game, seconds, input) {
  const steps = Math.round(seconds / STEP);
  for (let index = 0; index < steps; index += 1) game.step(STEP, input, game.mode);
}

function frameCamera(game, position, lookAt, fov) {
  game.camera.position.copy(position);
  if (fov) {
    game.camera.fov = fov;
    game.camera.updateProjectionMatrix();
  }
  game.camera.lookAt(lookAt);
  game.rig.freeze(position, lookAt);
  if (game.city.water) game.city.water.setCamera(position);
}

function settle(game) {
  game.boot.hide();
  game.hud.show();
  game.hud.promptsEnabled = false;
  game.hud.dismissPrompt();
  game.hud.update(0.016, game.hudState());
}

/** Put the walker somewhere without a camera attached: the traffic streams to them, not the shot. */
function parkWalker(game, x, z, facing = 0) {
  game.setMode('foot');
  game.player.position.set(x, groundHeight(x, z), z);
  game.player.mesh.position.copy(game.player.position);
  game.player.facing = facing;
  game.player.mesh.rotation.y = facing;
  game.player.setVisible(false);
}

/**
 * Cover: the bay from above the breakwater, the sun going down over the towers, the swell carrying
 * its light back at the lens, and the beach road busy with cars and walkers.
 */
function stageVista(game) {
  parkWalker(game, 168, -248, Math.PI);
  run(game, 26.0, IDLE);

  // A few walkers on the sand, so the beach is not a painted backdrop.
  game.pedestrians.scatter({ x: 20, z: -300 }, 34, 0.9);

  const eye = new THREE.Vector3(250, 38, -300);
  const look = new THREE.Vector3(-130, 16, -170);
  frameCamera(game, eye, look, 54);
  settle(game);
}

/** A major junction at eye level: queues on all four approaches and cross-traffic in the box. */
function stageStreet(game) {
  const junctionX = roadCenter(3);
  const junctionZ = roadCenter(2);
  parkWalker(game, junctionX + 12.5, junctionZ + 12.5, -2.4);
  run(game, 24.0, IDLE);

  // Hold the shot until the avenue has a red at the junction and the queue has stacked up behind
  // it: a still of a junction at the top of a green is a still of an empty junction.
  let guard = 0;
  while (game.traffic.lightIsGreen('z', 2, game.time) && guard < 1200) {
    game.step(STEP, IDLE, game.mode);
    guard += 1;
  }
  run(game, 3.4, IDLE);

  game.player.setVisible(false);
  const eye = new THREE.Vector3(junctionX + 22, 13, junctionZ + 32);
  const look = new THREE.Vector3(junctionX - 8, 0, junctionZ - 6);
  frameCamera(game, eye, look, 52);
  settle(game);
}

/** A pursuit: four stars, cruisers alongside, the boulevard running for the water. */
function stageChase(game) {
  game.setMode('car');
  game.car.place(roadCenter(3) - 0.6, 206, 0);
  game.car.speed = 24;
  game.rig.snap();
  run(game, 16.0, THROTTLE);

  game.car.place(roadCenter(3) - 0.6, 206, 0);
  game.car.speed = 27;
  game.rig.snap();

  game.police.setStars(4);
  game.police.place(0, roadCenter(3) - 7.6, 212, 0, 27);
  game.police.place(1, roadCenter(3) + 7.0, 210, 0, 27);
  game.police.place(2, roadCenter(3) - 2.2, 190, 0, 30);

  game.hud.show();
  game.boot.hide();
  run(game, 0.55, IDLE);

  game.hud.say('DISPATCH', 'All units, suspect in a stolen coupe heading south on the boulevard.', 8);
  game.hud.promptsEnabled = false;
  game.hud.update(0.016, game.hudState());
}

/** The job: on the pier, the wheel turning, the crowd at the rails, Sal on the radio. */
function stageMission(game) {
  const pierX = roadCenter(3) + 8;
  const wheelZ = OCEAN.waterStart - 66 + 16;
  game.setMode('foot');
  game.player.position.set(pierX - 2.4, 1.4, wheelZ + 26);
  game.player.mesh.position.copy(game.player.position);
  game.player.facing = Math.PI * 0.02;
  game.player.mesh.rotation.y = game.player.facing;
  game.player.setVisible(false);

  run(game, 9.0, IDLE);

  // A handful of people along the deck, posed where a camera on the pier would find them.
  const poses = [
    [pierX - 2.6, wheelZ + 62, 0.2],
    [pierX + 0.4, wheelZ + 60, -0.4],
    [pierX + 2.8, wheelZ + 63, 2.8],
    [pierX + 4.6, wheelZ + 58, 0.1],
    [pierX - 4.4, wheelZ + 57, -0.3],
    [pierX + 1.6, wheelZ + 52, 3.0],
    [pierX - 3.4, wheelZ + 34, 0.5],
    [pierX + 3.2, wheelZ + 26, 2.6],
  ];
  for (let index = 0; index < poses.length; index += 1) {
    const [x, z, heading] = poses[index];
    const person = game.pedestrians.addScripted(`pier-${index}`, x, z);
    person.heading = heading;
    person.pause = 999;
    person.y = 1.4;
  }
  game.pedestrians.writeMatrices();

  game.player.setVisible(false);
  game.missions.index = 0;
  game.missions.step = 1;
  game.missions.phase = 'active';
  game.missions.timer = 0;
  game.missions.refreshWaypoint();
  game.hud.setObjective('Curb Service — Drive it to Pier Nine');
  game.boot.hide();
  game.hud.show();
  game.hud.setCash(game.missions.cash);

  run(game, 2.4, IDLE);

  game.hud.showMission('Curb Service', 'Sal wants a car that is not yours, and he wants it at the pier by sundown.', 999);
  game.hud.say('SAL', 'Pier Nine, before the light goes. And do not scratch it — that car is worth more than you.', 999);
  game.hud.promptsEnabled = false;
  game.hud.update(0.016, game.hudState());

  const eye = new THREE.Vector3(pierX + 0.6, 3.1, wheelZ + 70);
  const look = new THREE.Vector3(pierX + 0.2, 3.0, wheelZ + 2);
  frameCamera(game, eye, look, 58);
  game.hud.update(0.016, game.hudState());
}

/** Stage the named scene; an unknown name falls back to the vista. */
export function stageShot(name, game) {
  if (name === 'street') {
    stageStreet(game);
    return 'street';
  }
  if (name === 'chase') {
    stageChase(game);
    return 'chase';
  }
  if (name === 'mission') {
    stageMission(game);
    return 'mission';
  }
  stageVista(game);
  return 'vista';
}
