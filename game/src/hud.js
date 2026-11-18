// The heads-up display: cash, health, the wanted stars, the objective line, subtitles, the
// minimap drawn from the same street grid the city was built on, and the story cards.
import { CITY, CITY_HALF, OCEAN, roadCenter } from './config.js';

const DISTRICTS = [
  'Coral Heights', 'Sunset Quay', 'Boulevard Nine', 'Palmera Row',
  'Calle Marina', 'Old Lagoon', 'Neon Parade', 'Casa Alta', 'Pier Nine',
];

const MAP_SPAN = 340;   // metres across the minimap
const MAP_ROAD = 18;    // how wide a street reads on the map

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.areaName = document.getElementById('area-name');
    this.cashValue = document.getElementById('cash-value');
    this.modeValue = document.getElementById('mode-value');
    this.healthFill = document.getElementById('health-fill');
    this.canvas = document.getElementById('minimap');
    this.context = this.canvas.getContext('2d');
    this.wantedStars = Array.from(document.querySelectorAll('#wanted .star'));
    this.objective = document.getElementById('objective');
    this.subtitle = document.getElementById('subtitle');
    this.subtitleSpeaker = document.getElementById('subtitle-speaker');
    this.subtitleLine = document.getElementById('subtitle-line');
    this.toastBox = document.getElementById('toast');
    this.missionCard = document.getElementById('mission-card');
    this.missionTitle = document.getElementById('mission-title');
    this.missionBrief = document.getElementById('mission-brief');
    this.ammoValue = document.getElementById('ammo-value');
    this.weaponName = document.getElementById('weapon-name');
    this.intro = document.getElementById('intro');
    this.introLine = document.getElementById('intro-line');
    this.introSpeaker = document.getElementById('intro-speaker');
    this.introHint = document.getElementById('intro-hint');
    this.promptBox = document.getElementById('prompt');
    this.promptKey = document.getElementById('prompt-key');
    this.promptText = document.getElementById('prompt-text');
    this.pauseCard = document.getElementById('pause');

    this.cash = 0;
    this.health = 1;
    this.stars = -1;
    this.district = '';
    this.subtitleTimer = 0;
    this.toastTimer = 0;
    this.missionTimer = 0;
    this.introQueue = null;
    this.promptTimer = 0;
    this.promptLine = '';
    this.promptsEnabled = true;
  }

  /** A prompt stays up for `seconds`, then fades: the HUD says nothing it does not have to. */
  prompt(key, text, seconds = 2.4) {
    if (!this.promptsEnabled) return;
    if (this.promptLine === text && this.promptTimer > 0) return;
    this.promptKey.textContent = key;
    this.promptText.textContent = text;
    this.promptLine = text;
    this.promptBox.classList.add('visible');
    this.promptTimer = seconds;
  }

  dismissPrompt() {
    this.promptTimer = 0;
    this.promptBox.classList.remove('visible');
  }

  get promptVisible() {
    return this.promptBox.classList.contains('visible');
  }

  setPause(open) {
    this.pauseCard.classList.toggle('visible', open);
  }

  show() {
    this.root.classList.add('visible');
  }

  hide() {
    this.root.classList.remove('visible');
  }

  setCash(amount) {
    this.cash = amount;
    this.cashValue.textContent = `$${Math.round(amount).toLocaleString('en-US')}`;
  }

  setHealth(fraction) {
    this.health = Math.max(0, Math.min(1, fraction));
    this.healthFill.style.width = `${Math.round(this.health * 100)}%`;
    this.healthFill.classList.toggle('critical', this.health < 0.3);
  }

  setWanted(stars) {
    if (stars === this.stars) return;
    this.stars = stars;
    this.wantedStars.forEach((star, index) => {
      const lit = index < stars;
      star.classList.toggle('lit', lit);
      star.classList.toggle('fresh', lit && index === stars - 1);
    });
  }

  setObjective(text) {
    this.objective.textContent = text;
    this.objective.classList.toggle('visible', Boolean(text));
  }

  setAmmo(ammo, reloading) {
    this.ammoValue.textContent = reloading ? '—' : String(ammo).padStart(2, '0');
    this.ammoValue.classList.toggle('reloading', Boolean(reloading));
  }

  say(speaker, text, seconds = 4.5) {
    this.subtitleSpeaker.textContent = speaker;
    this.subtitleLine.textContent = text;
    this.subtitle.classList.add('visible');
    this.subtitleTimer = seconds;
  }

  toast(text, seconds = 3.6) {
    this.toastBox.textContent = text;
    this.toastBox.classList.add('visible');
    this.toastTimer = seconds;
  }

  showMission(title, brief, seconds = 5.2) {
    this.missionTitle.textContent = title;
    this.missionBrief.textContent = brief;
    this.missionCard.classList.add('visible');
    this.missionTimer = seconds;
  }

  /** The opening: three cards, clicked through, naming the game and setting up the job. */
  showIntro(lines, done) {
    this.introQueue = lines.slice();
    this.introDone = done;
    this.intro.classList.add('visible');
    this.introHint.textContent = 'Click or press Enter';
    this.advanceIntro();
  }

  advanceIntro() {
    const queue = this.introQueue;
    if (!queue) return;
    if (!queue.length) {
      this.intro.classList.remove('visible');
      this.introQueue = null;
      const done = this.introDone;
      this.introDone = null;
      if (done) done();
      return;
    }
    const [speaker, text] = queue.shift();
    this.introSpeaker.textContent = speaker;
    this.introLine.textContent = text;
  }

  update(dt, state) {
    this.setCash(this.cash);
    const position = state.mode === 'car' ? state.car.position : state.player.position;
    const district = this.districtAt(position.x, position.z);
    if (district !== this.district) {
      this.district = district;
      this.areaName.textContent = district;
    }
    if (state.mode === 'car') {
      const speed = Math.round(Math.abs(state.car.speed) * 3.6);
      this.modeValue.textContent = `${speed} km/h`;
    } else {
      this.modeValue.textContent = 'On foot';
    }
    if (state.combat) this.setAmmo(state.combat.ammo, state.combat.reloading);
    this.setWanted(state.stars ?? 0);

    if (this.subtitleTimer > 0) {
      this.subtitleTimer -= dt;
      if (this.subtitleTimer <= 0) this.subtitle.classList.remove('visible');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastBox.classList.remove('visible');
    }
    if (this.missionTimer > 0) {
      this.missionTimer -= dt;
      if (this.missionTimer <= 0) this.missionCard.classList.remove('visible');
    }
    if (this.promptTimer > 0) {
      this.promptTimer -= dt;
      if (this.promptTimer <= 0) this.promptBox.classList.remove('visible');
    }

    this.drawMinimap(state);
  }

  districtAt(x, z) {
    if (z < OCEAN.beachStart + 20 && Math.abs(x - roadCenter(3) - 8) < 60) return 'Pier Nine';
    const blockX = Math.min(CITY.cells - 1, Math.max(0, Math.round((x + CITY_HALF) / CITY.pitch - 0.5)));
    const blockZ = Math.min(CITY.cells - 1, Math.max(0, Math.round((z + CITY_HALF) / CITY.pitch - 0.5)));
    return DISTRICTS[(blockX * CITY.cells + blockZ) % DISTRICTS.length];
  }

  drawMinimap(state) {
    const context = this.context;
    const size = this.canvas.width;
    const half = size / 2;
    const scale = size / MAP_SPAN;
    const position = state.mode === 'car' ? state.car.position : state.player.position;

    context.clearRect(0, 0, size, size);
    context.save();
    context.beginPath();
    context.arc(half, half, half - 3, 0, Math.PI * 2);
    context.clip();

    context.fillStyle = '#16343c';
    context.fillRect(0, 0, size, size);

    const toX = (worldX) => half + (worldX - position.x) * scale;
    const toY = (worldZ) => half + (worldZ - position.z) * scale;

    const sandY = toY(OCEAN.beachStart);
    if (sandY < size) {
      context.fillStyle = '#e3c795';
      context.fillRect(0, sandY, size, size - sandY);
    }
    const waterY = toY(OCEAN.beachEnd);
    if (waterY < size) {
      context.fillStyle = '#1d7f9c';
      context.fillRect(0, waterY, size, size - waterY);
    }

    context.fillStyle = '#2f4f57';
    const road = MAP_ROAD * scale;
    for (let index = 0; index <= CITY.cells; index += 1) {
      const line = roadCenter(index);
      context.fillRect(0, toY(line) - road / 2, size, road);
      context.fillRect(toX(line) - road / 2, 0, road, size);
    }

    // Walkers: a faint scatter of dots, enough to read "people" at a glance.
    if (state.pedestrians) {
      context.fillStyle = 'rgba(246,241,230,0.5)';
      for (const person of state.pedestrians.people) {
        if (person.dead) continue;
        const x = toX(person.x);
        const y = toY(person.z);
        context.fillRect(x - 1, y - 1, 2, 2);
      }
    }

    // Cruisers flash red.
    if (state.police) {
      const pulse = Math.sin(performance.now() * 0.012) > 0 ? '#ff4b3a' : '#5a8cff';
      context.fillStyle = pulse;
      for (const unit of state.police.units) {
        context.beginPath();
        context.arc(toX(unit.car.position.x), toY(unit.car.position.z), 4, 0, Math.PI * 2);
        context.fill();
      }
    }

    // The objective ring.
    if (state.waypoint) {
      context.strokeStyle = '#64e8ff';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(toX(state.waypoint.x), toY(state.waypoint.z), 6, 0, Math.PI * 2);
      context.stroke();
    }

    context.save();
    context.translate(half, half);
    if (state.mode === 'car') {
      context.rotate(Math.PI - state.car.heading);
      context.fillStyle = '#ff7a4d';
      context.fillRect(-3.5, -6, 7, 12);
    } else {
      context.rotate(-state.cameraYaw);
      context.beginPath();
      context.moveTo(0, -9);
      context.lineTo(6.5, 7);
      context.lineTo(0, 3.5);
      context.lineTo(-6.5, 7);
      context.closePath();
      context.fillStyle = '#ff7a4d';
      context.fill();
    }
    context.restore();

    const vignette = context.createRadialGradient(half, half, half * 0.5, half, half, half);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(4,16,20,0.6)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, size, size);

    context.restore();
    context.strokeStyle = 'rgba(246,241,230,0.28)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(half, half, half - 3, 0, Math.PI * 2);
    context.stroke();
  }
}
