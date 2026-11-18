// Palm Havoc — the city of Marisol Bay. Every measurement, colour, handling and rule number the
// world, the walker, the traffic, the pedestrians and the police share lives in this one file.

export const NAME = 'Palm Havoc';
export const CITY_NAME = 'Marisol Bay';

export const CITY = {
  cells: 5,           // blocks along each side of the grid
  pitch: 104,         // centre-to-centre distance between parallel streets
  roadWidth: 18,
  sidewalkWidth: 5,
  curbHeight: 0.16,
  lotInset: 3,        // how far a building sits back from the pavement edge
};

export const CITY_SPAN = CITY.cells * CITY.pitch;
export const CITY_HALF = CITY_SPAN / 2;
export const BLOCK_SIZE = CITY.pitch - CITY.roadWidth;
export const LOT_SIZE = BLOCK_SIZE - CITY.sidewalkWidth * 2;

/** World coordinate of street `index` (0 to CITY.cells), running north-south or east-west. */
export function roadCenter(index) {
  return -CITY_HALF + index * CITY.pitch;
}

/** World coordinate of the centre of block `index` (0 to CITY.cells - 1). */
export function blockCenter(index) {
  return roadCenter(index) + CITY.pitch / 2;
}

/** The bay runs along the south edge of the grid; the beach and the water start past it. */
export const OCEAN = {
  beachStart: -CITY_HALF - 26,
  beachEnd: -CITY_HALF - 120,
  waterStart: -CITY_HALF - 96,
  level: -0.34,
};

/** Direction toward the sun, in world space: low, warm and down the main boulevard. */
export const SUN = { x: -0.47, y: 0.30, z: -0.78 };

/** What the player is worth on arrival: the number the HUD, the save and the payouts agree on. */
export const START_CASH = 1200;

export const COLORS = {
  skyTop: 0x1c6ed0,
  skyMid: 0x6fb6e9,
  horizon: 0xf8e0c0,
  haze: 0xd6c7ab,
  sunDisc: 0xfff6de,
  asphalt: 0x43474e,
  laneMark: 0xf6f1e2,
  crossing: 0xf0ebdd,
  pavement: 0xd8cfbf,
  curb: 0xbeb5a5,
  sand: 0xf0d8ab,
  water: 0x1b7f9c,
  outskirt: 0xb9b08c,
  palmTrunk: 0x8a6b4a,
  palmLeaf: 0x4f8f3c,
  palmLeafDark: 0x3d7530,
  policeBody: 0x1d2733,
  policeTrim: 0xf2f3ef,
};

/**
 * Four building families, each with its own facade sheet, storefront sheet and roof treatment.
 * `family` chooses the sheet; `accent` paints the awning, the sign frame and the storefront fascia.
 */
export const FACADES = [
  { family: 'deco', wall: '#f4e8d4', trim: '#dbc9b1', accent: '#c4603f' },
  { family: 'deco', wall: '#e89c88', trim: '#f7d5c6', accent: '#2f6f74' },
  { family: 'deco', wall: '#a3d3c6', trim: '#dcf0ea', accent: '#d1793f' },
  { family: 'deco', wall: '#f1ce95', trim: '#fbe9c9', accent: '#3c7f92' },
  { family: 'brick', wall: '#b6603f', trim: '#e3c3a8', accent: '#243c4a' },
  { family: 'brick', wall: '#8f4a37', trim: '#d9b79c', accent: '#e0a34c' },
  { family: 'glass', wall: '#7fa9b8', trim: '#cfe3e8', accent: '#2c4a55' },
  { family: 'glass', wall: '#93b6ad', trim: '#d7e8e0', accent: '#33565f' },
  { family: 'stone', wall: '#dfdcd3', trim: '#f8f6f0', accent: '#b9433c' },
  { family: 'stone', wall: '#c9c6bb', trim: '#efede6', accent: '#3d5c74' },
];

export const DRESS = {
  skin: '#c98d63',
  hair: '#241c16',
  shirt: '#d9603b',
  trousers: '#2f3b52',
  shoes: '#f2f0e9',
};

export const CAR_PAINT = {
  body: '#c9382f',
  bodyDark: '#8f241f',
  roof: '#f5efe4',
  glass: '#22303a',
  chrome: '#cfd5d8',
  tyre: '#1b1d21',
  lamp: '#ffe9b0',
  tail: '#ff5a44',
};

export const TRAFFIC_PAINTS = [
  '#e8e4d8', '#2f4a63', '#c9382f', '#1f6b5e', '#d7a24a', '#8e93a0',
  '#5b3a54', '#f0f0ea', '#b2462f', '#3f6f8f', '#6c7a4a', '#d8c9a8',
];

/** Traffic: how many cars orbit the grid, how fast and how closely they queue. */
export const TRAFFIC = {
  count: 132,
  despawn: 172,
  laneOffset: 4.5,
  cruise: 12.8,
  turnSpeed: 7.0,
  accel: 6.5,
  brake: 18,
  gap: 9.2,
  lightCycle: 13,     // seconds for a full green/red cycle at every junction
  stopLine: 13.5,
  stealRadius: 5.5,
};

/** Pedestrians: walkers on the pavement rings, and how far they run when something goes wrong. */
export const PED = {
  count: 176,
  speed: 1.35,
  runSpeed: 4.6,
  radius: 0.36,
  panicTime: 5.5,
  panicRadius: 13,
  fleeRadius: 22,
};

/** Police: how many units answer each star level, and how hard they push. */
export const POLICE = {
  maxUnits: 4,
  cruise: 27,
  response: 3.6,      // seconds between spawns
  ramRadius: 2.9,
  ramDamage: 0.22,
  shootRange: 34,
  shootEvery: 1.35,
  shotDamage: 0.09,
  escapeTime: 14,     // seconds out of sight before a star drops
  starCooldown: 3.0,
};

/** The pistol: hitscan, one shot per trigger pull, six in the magazine before a reload beat. */
export const GUN = {
  range: 90,
  damage: 0.55,
  magazine: 12,
  reloadTime: 1.5,
  fireDelay: 0.22,
};

/** Wanted level thresholds and what each crime is worth. */
export const CRIME = {
  theft: 1,
  gunfire: 1,
  assault: 1,
  policeAssault: 2,
  pedestrianHit: 1,
  maxStars: 5,
  decayAfter: 22,
};

/** Walking: metres a second, and how sharply the walker answers the keyboard. */
export const PLAYER = {
  walkSpeed: 4.4,
  runSpeed: 7.8,
  acceleration: 34,
  drag: 11,
  radius: 0.42,
  height: 1.84,
  eyeHeight: 1.62,
  stepHeight: 0.2,
  maxHealth: 1,
};

/** Driving: an arcade model that leans on grip and a bicycle-steering yaw rate. */
export const CAR = {
  length: 4.5,
  width: 1.95,
  height: 1.3,
  wheelBase: 2.72,
  maxSpeed: 36,
  reverseSpeed: 9,
  acceleration: 16,
  brakeForce: 34,
  rollingDrag: 0.42,
  airDrag: 0.0016,
  maxSteer: 0.62,
  steerRate: 4.2,
  handbrake: 26,
  collisionRadius: 1.5,
};

export const CAMERA = {
  fov: 60,
  carFov: 68,
  footDistance: 4.9,
  footHeight: 2.1,
  footLookHeight: 1.45,
  carDistance: 8.6,
  carHeight: 3.4,
  carLookAhead: 6.0,
  minPitch: -0.55,
  maxPitch: 0.95,
  sensitivity: 0.0026,
  followLag: 6.5,
  fovLag: 2.2,
};

export const WORLD = {
  fogNear: 200,
  fogFar: 1580,
  shadowRadius: 148,
  shadowMapSize: 2048,
};

/** The three chained jobs. Each names its objectives, its payout and where it happens. */
export const MISSIONS = [
  {
    id: 'curb-service',
    title: 'Curb Service',
    brief: 'Sal wants a car that is not yours, and he wants it at the pier by sundown.',
    objectives: [
      { kind: 'steal', text: 'Steal any car on the street' },
      { kind: 'goto', text: 'Drive it to Pier Nine', target: 'pier', radius: 26 },
    ],
    payout: 750,
  },
  {
    id: 'heat-check',
    title: 'Heat Check',
    brief: 'The bay police need reminding who runs these blocks. Make noise, then vanish.',
    objectives: [
      { kind: 'stars', text: 'Reach a two-star wanted level', stars: 2 },
      { kind: 'evade', text: 'Shake the pursuit and drop to zero stars' },
    ],
    payout: 1500,
  },
  {
    id: 'last-word',
    title: 'Last Word',
    brief: 'Sal keeps the ledger at the pier arcade. Take it back, and take him out of the picture.',
    objectives: [
      { kind: 'goto', text: 'Reach the pier arcade on foot', target: 'arcade', radius: 9 },
      { kind: 'kill', text: 'Take down Sal\'s man at the arcade' },
      { kind: 'goto', text: 'Return to the wheel and collect', target: 'wheel', radius: 12 },
    ],
    payout: 4000,
  },
];

export const SAVE_KEY = 'palm-havoc-save-v1';
