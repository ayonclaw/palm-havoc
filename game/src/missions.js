// The three jobs, in order, with objectives that the game actually checks: steal a car, reach the
// pier, draw stars, shake them, shoot a man, come back to the wheel. Each pays out, each saves.
import * as THREE from '../vendor/three.module.min.js';
import { MISSIONS, CITY, START_CASH, roadCenter } from './config.js';

const INTRO_LINES = [
  ['SAL', 'Three years I kept your seat warm at the arcade, and this is how you come back?'],
  ['YOU', 'I came back for the ledger, Sal. Not the seat.'],
  ['SAL', 'Then you work for it. Start with a car that is not yours.'],
];

export class Missions {
  constructor(context) {
    this.context = context;
    this.index = 0;
    this.step = 0;
    this.phase = 'idle';
    this.timer = 0;
    this.cash = context.cash ?? START_CASH;
    this.completed = [];
    this.stoleCar = false;
    this.starsSeen = 0;
    this.scripted = null;
    this.introSeen = false;

    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0x64e8ff, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false,
    });
    this.marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.4, 5.4, 28), markerMaterial.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(4.6, 4.6, 22, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x64e8ff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
      }),
    );
    column.position.y = 11;
    this.marker.add(ring, column);
    this.marker.visible = false;
    this.ring = ring;
    context.scene.add(this.marker);
    this.waypoint = null;
  }

  get mission() {
    return MISSIONS[this.index] ?? null;
  }

  get objective() {
    const mission = this.mission;
    if (!mission || this.phase !== 'active') return null;
    return mission.objectives[this.step] ?? null;
  }

  /** Play the story intro, then hand the player the first job. */
  start() {
    const { hud } = this.context;
    hud.showIntro(INTRO_LINES, () => {
      this.introSeen = true;
      this.begin(0);
    });
  }

  begin(index) {
    this.index = Math.max(0, Math.min(MISSIONS.length - 1, index));
    this.step = 0;
    this.phase = 'brief';
    this.timer = 0;
    this.stoleCar = false;
    this.starsSeen = 0;
    const mission = this.mission;
    this.context.hud.showMission(mission.title, mission.brief);
    this.context.hud.setObjective(`${mission.title} — ${mission.objectives[0].text}`);
    this.placeScripted();
    this.refreshWaypoint();
  }

  /** Sal's man stands outside the arcade with a bad attitude and a hitbox. */
  placeScripted() {
    const mission = this.mission;
    if (!mission || mission.id !== 'last-word') return;
    if (this.scripted && !this.scripted.dead) return;
    const arcade = this.context.landmarks.arcade;
    this.scripted = this.context.pedestrians.addScripted('sal-man', arcade.x - 6, arcade.z + 8);
  }

  /** Advance to the next objective, or finish the job and pay. */
  next() {
    const mission = this.mission;
    if (!mission) return;
    this.step += 1;
    if (this.step < mission.objectives.length) {
      this.context.hud.setObjective(`${mission.title} — ${mission.objectives[this.step].text}`);
      this.context.audio.ping('objective');
      this.refreshWaypoint();
      return;
    }
    this.finish();
  }

  finish() {
    const mission = this.mission;
    this.phase = 'complete';
    this.completed.push(mission.id);
    this.cash += mission.payout;
    this.marker.visible = false;
    this.waypoint = null;
    const { hud, audio, save } = this.context;
    hud.setCash(this.cash);
    hud.toast(`${mission.title} complete  +$${mission.payout.toLocaleString('en-US')}`);
    hud.setObjective('Free roam — steal, drive, make noise');
    audio.jingle();
    if (save) save();
    this.timer = 0;
    if (this.index + 1 < MISSIONS.length) {
      this.index += 1;
      this.phase = 'idle';
      this.step = 0;
      this.pending = 6;
    } else {
      this.phase = 'done';
      hud.showMission('Palm Havoc', 'The ledger is yours. The bay is not done with you yet.');
    }
  }

  /** A car was taken: the first job's first objective lives here. */
  stole() {
    this.stoleCar = true;
    this.starsSeen = Math.max(this.starsSeen, this.context.police.stars);
  }

  /** Put the marker where the current objective points, or hide it. */
  refreshWaypoint() {
    const objective = this.objective;
    if (!objective || objective.kind !== 'goto') {
      // The steal objective points at the nearest car: show a marker on nothing and let the HUD hint.
      this.marker.visible = false;
      this.waypoint = null;
      return;
    }
    const target = this.context.landmarks[objective.target];
    if (!target) {
      this.marker.visible = false;
      return;
    }
    this.waypoint = { x: target.x, z: target.z, radius: objective.radius };
    this.marker.position.set(target.x, 0, target.z);
    this.marker.visible = true;
  }

  update(dt) {
    this.timer += dt;
    if (this.marker.visible) {
      const pulse = 1 + Math.sin(this.timer * 3) * 0.06;
      this.marker.scale.set(pulse, 1, pulse);
      this.ring.material.opacity = 0.35 + Math.sin(this.timer * 3) * 0.15;
    }

    if (this.phase === 'brief' && this.timer > 0.1) {
      this.phase = 'active';
      this.timer = 0;
      this.refreshWaypoint();
      return;
    }

    if (this.phase === 'idle' && this.pending > 0) {
      this.pending -= dt;
      if (this.pending <= 0) this.begin(this.index);
      return;
    }

    const objective = this.objective;
    if (!objective) return;
    const player = this.context.player;
    const car = this.context.getCar();
    const inCar = this.context.inCar();

    if (objective.kind === 'steal') {
      if (this.stoleCar) this.next();
    } else if (objective.kind === 'goto') {
      const target = this.context.landmarks[objective.target];
      if (!target) return;
      const position = inCar ? car.position : player.position;
      const distance = Math.hypot(position.x - target.x, position.z - target.z);
      if (distance < objective.radius) this.next();
    } else if (objective.kind === 'stars') {
      if (this.context.police.stars >= objective.stars) this.next();
    } else if (objective.kind === 'evade') {
      if (this.starsSeen < 1) this.starsSeen = this.context.police.stars;
      if (this.starsSeen >= 1 && this.context.police.stars === 0) this.next();
    } else if (objective.kind === 'kill') {
      if (this.scripted && this.scripted.dead) this.next();
    }
  }

  /** State for the save file. */
  snapshot() {
    return {
      index: this.index,
      step: this.step,
      phase: this.phase,
      completed: [...this.completed],
      cash: this.cash,
      introSeen: this.introSeen,
    };
  }

  restore(data) {
    if (!data) return;
    this.index = Math.max(0, Math.min(MISSIONS.length - 1, data.index ?? 0));
    this.step = data.step ?? 0;
    this.phase = data.phase === 'active' ? 'active' : 'brief';
    this.completed = Array.isArray(data.completed) ? data.completed : [];
    this.cash = typeof data.cash === 'number' ? data.cash : START_CASH;
    this.introSeen = Boolean(data.introSeen);
    this.timer = 0;
    this.placeScripted();
    this.refreshWaypoint();
    if (this.mission) {
      this.context.hud.setObjective(`${this.mission.title} — ${this.mission.objectives[this.step]?.text ?? ''}`);
    }
  }
}
