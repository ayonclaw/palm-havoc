// Everything the city is painted with, drawn into canvases at load time: asphalt, pavement,
// sand, water, four families of facade, storefronts with real shop names, and signage. No image
// file, no network request.
import * as THREE from '../vendor/three.module.min.js';
import { FACADES } from './config.js';
import { SHOP_NAMES, FONTS, treatmentFor } from './shops.js';
import { range } from './rng.js';

function canvasOf(width, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function speckle(ctx, size, random, count, lightness) {
  for (let index = 0; index < count; index += 1) {
    const value = Math.floor(lightness + range(random, -24, 24));
    ctx.fillStyle = `rgba(${value},${value},${value},0.16)`;
    const radius = range(random, 0.6, 2.4);
    ctx.fillRect(range(random, 0, size), range(random, 0, size), radius, radius);
  }
}

function finish(canvas, repeat) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) texture.repeat.set(repeat, repeat);
  return texture;
}

/** Dark, patchy road surface. Tiled about eight metres to the repeat. */
export function createAsphalt(random) {
  const size = 256;
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4b4f57';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, random, 9000, 96);
  for (let patch = 0; patch < 14; patch += 1) {
    ctx.fillStyle = `rgba(28,30,34,${range(random, 0.05, 0.16).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(range(random, 0, size), range(random, 0, size), range(random, 6, 34), range(random, 4, 26), random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(canvas, 9);
}

/** Warm concrete slabs for the pavements, with a darker seam every two slabs. */
export function createPavement(random) {
  const size = 256;
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d9d0c0';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, random, 5000, 205);
  ctx.strokeStyle = 'rgba(120,110,96,0.35)';
  ctx.lineWidth = 2;
  for (let line = 0; line <= size; line += 64) {
    ctx.beginPath();
    ctx.moveTo(line, 0);
    ctx.lineTo(line, size);
    ctx.moveTo(0, line);
    ctx.lineTo(size, line);
    ctx.stroke();
  }
  for (let stain = 0; stain < 26; stain += 1) {
    ctx.fillStyle = `rgba(96,86,72,${range(random, 0.03, 0.09).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(range(random, 0, size), range(random, 0, size), range(random, 6, 26), range(random, 5, 20), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(canvas, 6);
}

/** Wind-rippled sand for the beach. */
export function createSand(random) {
  const size = 256;
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f0d8ab';
  ctx.fillRect(0, 0, size, size);
  for (let ripple = 0; ripple < 90; ripple += 1) {
    ctx.strokeStyle = `rgba(206,178,132,${range(random, 0.12, 0.34).toFixed(3)})`;
    ctx.lineWidth = range(random, 1, 3);
    const y = range(random, 0, size);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + range(random, -8, 8), size * 0.7, y + range(random, -8, 8), size, y);
    ctx.stroke();
  }
  speckle(ctx, size, random, 2600, 224);
  return finish(canvas, 20);
}

/** Long, pale crests on the bay: a tiling map that reads as swell from any distance. */
export function createWater(random) {
  const size = 256;
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1b7f9c';
  ctx.fillRect(0, 0, size, size);
  for (let crest = 0; crest < 120; crest += 1) {
    const y = range(random, 0, size);
    const alpha = range(random, 0.03, 0.14);
    ctx.strokeStyle = `rgba(220,246,250,${alpha.toFixed(3)})`;
    ctx.lineWidth = range(random, 1, 4);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.35, y + range(random, -6, 6), size * 0.65, y + range(random, -6, 6), size, y);
    ctx.stroke();
  }
  for (let dark = 0; dark < 40; dark += 1) {
    ctx.fillStyle = `rgba(9,52,70,${range(random, 0.04, 0.12).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(range(random, 0, size), range(random, 0, size), range(random, 10, 40), range(random, 4, 14), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(canvas, 14);
}

/* ------------------------------------------------------------------ facades */

function decoSheet(ctx, facade, size, random) {
  const bay = size / 4;
  ctx.fillStyle = facade.wall;
  ctx.fillRect(0, 0, size, size);

  for (let blot = 0; blot < 700; blot += 1) {
    ctx.fillStyle = `rgba(255,255,255,${range(random, 0.02, 0.06).toFixed(3)})`;
    ctx.fillRect(range(random, 0, size), range(random, 0, size), 3, 3);
  }

  for (let floor = 0; floor < 4; floor += 1) {
    const top = floor * bay;
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(0, top, size, 6);
    ctx.fillStyle = facade.trim;
    ctx.fillRect(0, top + 1, size, 3);

    for (let column = 0; column < 4; column += 1) {
      const left = column * bay + 15;
      const width = bay - 30;
      const height = bay - 34;
      const windowTop = top + 22;

      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(left - 4, windowTop - 4, width + 8, height + 8);

      const lit = random() < 0.09;
      const glass = ctx.createLinearGradient(left, windowTop, left + width * 0.4, windowTop + height);
      if (lit) {
        glass.addColorStop(0, '#ffe1a6');
        glass.addColorStop(1, '#d99a58');
      } else {
        glass.addColorStop(0, '#2f4650');
        glass.addColorStop(0.55, '#4e6f7b');
        glass.addColorStop(1, '#6d909c');
      }
      ctx.fillStyle = glass;
      ctx.fillRect(left, windowTop, width, height);

      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(left + Math.round(width / 2) - 1, windowTop, 2, height);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(left, windowTop + Math.round(height * 0.42), width, 2);

      ctx.fillStyle = 'rgba(30,30,30,0.16)';
      ctx.fillRect(left - 4, windowTop + height + 4, width + 8, 3);
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (let column = 1; column < 4; column += 1) {
    ctx.fillRect(column * bay - 1.5, 0, 3, size);
  }

  const shade = ctx.createLinearGradient(0, size - 34, 0, size);
  shade.addColorStop(0, 'rgba(90,70,50,0)');
  shade.addColorStop(1, 'rgba(90,70,50,0.24)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, size - 34, size, 34);
}

function brickSheet(ctx, facade, size, random) {
  ctx.fillStyle = facade.wall;
  ctx.fillRect(0, 0, size, size);

  // Courses of brick, a half-brick offset every other row.
  const course = 8;
  for (let row = 0; row < size / course; row += 1) {
    const y = row * course;
    ctx.fillStyle = row % 2 ? 'rgba(0,0,0,0.055)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, y, size, 1);
    const offset = row % 2 ? 9 : 0;
    for (let x = offset; x < size; x += 18) {
      ctx.fillStyle = `rgba(0,0,0,${range(random, 0.03, 0.1).toFixed(3)})`;
      ctx.fillRect(x, y, 1, course - 1);
    }
    if (random() < 0.25) {
      ctx.fillStyle = `rgba(255,240,220,${range(random, 0.03, 0.09).toFixed(3)})`;
      ctx.fillRect(range(random, 0, size), y + 1, range(random, 8, 22), course - 2);
    }
  }

  const bay = size / 4;
  for (let floor = 0; floor < 4; floor += 1) {
    const top = floor * bay;
    // Stone lintel band under each floor.
    ctx.fillStyle = facade.trim;
    ctx.fillRect(0, top + bay - 9, size, 6);

    for (let column = 0; column < 4; column += 1) {
      const left = column * bay + 20;
      const width = bay - 40;
      const height = bay - 46;
      const windowTop = top + 20;

      ctx.fillStyle = facade.trim;
      ctx.fillRect(left - 6, windowTop - 8, width + 12, 8);
      ctx.fillRect(left - 6, windowTop - 8, 6, height + 14);
      ctx.fillRect(left + width, windowTop - 8, 6, height + 14);

      const glass = ctx.createLinearGradient(left, windowTop, left, windowTop + height);
      glass.addColorStop(0, '#26363c');
      glass.addColorStop(0.6, '#3d5b63');
      glass.addColorStop(1, '#57787d');
      ctx.fillStyle = glass;
      ctx.fillRect(left, windowTop, width, height);

      // Sash bars.
      ctx.fillStyle = 'rgba(240,235,225,0.75)';
      ctx.fillRect(left, windowTop + Math.round(height / 2) - 1, width, 2);
      ctx.fillRect(left + Math.round(width / 2) - 1, windowTop, 2, height);

      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      ctx.fillRect(left - 6, windowTop + height + 6, width + 12, 4);
    }
  }

  // Fire escape zig-zags down one bay: the silhouette that says tenement.
  const escapeX = bay * 2 + 6;
  ctx.strokeStyle = 'rgba(46,38,32,0.55)';
  ctx.lineWidth = 3;
  for (let floor = 0; floor < 4; floor += 1) {
    const y = floor * bay + bay - 24;
    ctx.beginPath();
    ctx.moveTo(escapeX, y);
    ctx.lineTo(escapeX + 40, y);
    ctx.stroke();
    if (floor < 3) {
      ctx.beginPath();
      ctx.moveTo(escapeX + 6, y);
      ctx.lineTo(escapeX + 38, y + bay);
      ctx.stroke();
    }
  }
}

function glassSheet(ctx, facade, size, random) {
  const bay = size / 4;
  // A continuous curtain wall: mullions and spandrels, no punched windows.
  const sky = ctx.createLinearGradient(0, 0, size, size);
  sky.addColorStop(0, '#38525c');
  sky.addColorStop(0.35, '#5d8592');
  sky.addColorStop(0.55, '#8fb4bd');
  sky.addColorStop(0.75, '#5b7f8c');
  sky.addColorStop(1, '#2f4855');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, size, size);

  for (let floor = 0; floor < 4; floor += 1) {
    const top = floor * bay;
    ctx.fillStyle = facade.trim;
    ctx.fillRect(0, top, size, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, top + 7, size, 3);
    for (let column = 0; column < 4; column += 1) {
      const left = column * bay;
      ctx.fillStyle = 'rgba(232,240,242,0.7)';
      ctx.fillRect(left, top, 3, bay);
      // A reflection streak in each pane.
      ctx.fillStyle = `rgba(255,255,255,${range(random, 0.05, 0.16).toFixed(3)})`;
      ctx.fillRect(left + range(random, 10, 44), top + 12, range(random, 3, 9), bay - 30);
    }
  }
  for (let column = 0; column <= 4; column += 1) {
    ctx.fillStyle = 'rgba(240,246,248,0.55)';
    ctx.fillRect(column * bay - 1, 0, 2, size);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, 0, size, size * 0.25);
}

function stoneSheet(ctx, facade, size, random) {
  const bay = size / 4;
  ctx.fillStyle = facade.wall;
  ctx.fillRect(0, 0, size, size);

  // Ashlar blocks.
  for (let row = 0; row < 16; row += 1) {
    const y = row * (size / 16);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, y, size, 1);
    const offset = row % 2 ? 16 : 0;
    for (let x = offset; x < size; x += 32) {
      ctx.fillStyle = 'rgba(0,0,0,0.04)';
      ctx.fillRect(x, y, 1, size / 16);
    }
    if (random() < 0.3) {
      ctx.fillStyle = `rgba(255,255,255,${range(random, 0.03, 0.07).toFixed(3)})`;
      ctx.fillRect(range(random, 0, size), y + 1, range(random, 10, 30), size / 16 - 1);
    }
  }
  speckle(ctx, size, random, 2200, 200);

  for (let floor = 0; floor < 4; floor += 1) {
    const top = floor * bay;
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, top, size, 5);
    for (let column = 0; column < 4; column += 1) {
      const left = column * bay + 22;
      const width = bay - 44;
      const height = bay - 48;
      const windowTop = top + 26;
      // Deep reveal: a shadowed recess holding the glass.
      ctx.fillStyle = 'rgba(40,36,30,0.35)';
      ctx.fillRect(left - 7, windowTop - 7, width + 14, height + 14);
      const glass = ctx.createLinearGradient(left, windowTop, left, windowTop + height);
      glass.addColorStop(0, '#33454b');
      glass.addColorStop(1, '#68868c');
      ctx.fillStyle = glass;
      ctx.fillRect(left, windowTop, width, height);
      ctx.fillStyle = 'rgba(250,246,238,0.5)';
      ctx.fillRect(left, windowTop + Math.round(height / 3), width, 2);
      if (random() < 0.18) {
        ctx.fillStyle = 'rgba(255,226,166,0.5)';
        ctx.fillRect(left, windowTop, width, height);
      }
      // Cornice over each window.
      ctx.fillStyle = facade.trim;
      ctx.fillRect(left - 9, windowTop - 12, width + 18, 5);
    }
  }
}

/** One facade sheet per palette entry: four floors over four bays, in the entry's family style. */
export function createFacadeTextures(random) {
  return FACADES.map((facade) => {
    const size = 256;
    const canvas = canvasOf(size);
    const ctx = canvas.getContext('2d');
    if (facade.family === 'brick') brickSheet(ctx, facade, size, random);
    else if (facade.family === 'glass') glassSheet(ctx, facade, size, random);
    else if (facade.family === 'stone') stoneSheet(ctx, facade, size, random);
    else decoSheet(ctx, facade, size, random);

    const shade = ctx.createLinearGradient(0, size - 26, 0, size);
    shade.addColorStop(0, 'rgba(60,46,36,0)');
    shade.addColorStop(1, 'rgba(60,46,36,0.22)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, size - 26, size, 26);

    return { map: finish(canvas, null), facade, family: facade.family };
  });
}

/** Set a line of type as large as `maxWidth` allows, and return the size it settled on. */
function sizedType(ctx, text, weight, face, tracking, maxWidth, start) {
  let size = start;
  ctx.font = `${weight} ${size}px ${FONTS[face]}`;
  let width = ctx.measureText(text).width + tracking * size * (text.length - 1);
  while (width > maxWidth && size > 9) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${FONTS[face]}`;
    width = ctx.measureText(text).width + tracking * size * (text.length - 1);
  }
  return size;
}

/** Letter-spaced type, drawn glyph by glyph so the tracking is real. */
function trackedType(ctx, text, x, y, tracking) {
  const step = tracking * ctx.font.match(/(\d+(?:\.\d+)?)px/)[1];
  let cursor = x;
  for (const glyph of text) {
    ctx.fillText(glyph, cursor + ctx.measureText(glyph).width / 2, y);
    cursor += ctx.measureText(glyph).width + step;
  }
}

/** Width of a tracked line, for centring and for fitting a rule under it. */
function trackedWidth(ctx, text, tracking) {
  const size = Number(ctx.font.match(/(\d+(?:\.\d+)?)px/)[1]);
  return ctx.measureText(text).width + tracking * size * Math.max(0, text.length - 1);
}

function trackedStroke(ctx, text, x, y, tracking) {
  const step = tracking * Number(ctx.font.match(/(\d+(?:\.\d+)?)px/)[1]);
  let cursor = x;
  for (const glyph of text) {
    ctx.strokeText(glyph, cursor + ctx.measureText(glyph).width / 2, y);
    cursor += ctx.measureText(glyph).width + step;
  }
}

/**
 * Ground floors: big shop windows, the accent on the frames, and the shop's own name on the fascia
 * in the treatment the deck assigns it. One texture per name, never two names the same.
 */
export function createStorefrontTextures(random) {
  return SHOP_NAMES.map((rawName, index) => {
    const style = treatmentFor(index);
    const name = style.upper ? rawName.toUpperCase() : rawName;
    const width = 384;
    const height = 128;
    const canvas = canvasOf(width, height);
    const ctx = canvas.getContext('2d');

    // The wall behind the glass: dark for the banded signs, softer for the painted ones.
    const wall = ctx.createLinearGradient(0, 0, 0, height);
    wall.addColorStop(0, style.panel);
    wall.addColorStop(1, '#241f1c');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, width, height);

    const fasciaHeight = style.fascia === 'blade' ? 34 : 44;

    // Four panes of glass, with a lit interior behind them.
    const paneCount = 4;
    const paneGap = 8;
    const paneWidth = (width - paneGap * (paneCount + 1) - 26) / paneCount;
    for (let pane = 0; pane < paneCount; pane += 1) {
      const left = paneGap + pane * (paneWidth + paneGap);
      const top = fasciaHeight + 10;
      const glass = ctx.createLinearGradient(left, top, left, height - 10);
      glass.addColorStop(0, style.windows);
      glass.addColorStop(0.55, '#7ba3ad');
      glass.addColorStop(1, '#b6cfd2');
      ctx.fillStyle = glass;
      ctx.fillRect(left, top, paneWidth, height - top - 12);

      const glow = ctx.createLinearGradient(left, top + 18, left + paneWidth, height - 12);
      glow.addColorStop(0, `rgba(255,214,152,${range(random, 0.1, 0.34).toFixed(2)})`);
      glow.addColorStop(1, 'rgba(255,214,152,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(left, top + 14, paneWidth, height - top - 26);

      // Goods stacked against the glass, so it is a shop and not a mirror.
      for (let item = 0; item < 3; item += 1) {
        ctx.fillStyle = ['#d8b478', '#b8523f', '#e8e0cc', '#5f8d6a', '#c4885a'][Math.floor(random() * 5)];
        ctx.fillRect(
          left + range(random, 4, Math.max(5, paneWidth - 14)),
          height - range(random, 16, 40),
          range(random, 6, 13),
          range(random, 8, 18),
        );
      }

      ctx.strokeStyle = 'rgba(18,24,26,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeRect(left, top, paneWidth, height - top - 12);
    }

    // The door, recessed at the right-hand end of the frontage.
    ctx.fillStyle = 'rgba(14,20,24,0.78)';
    ctx.fillRect(width - 26, fasciaHeight + 14, 20, height - fasciaHeight - 24);
    ctx.fillStyle = 'rgba(232,224,206,0.5)';
    ctx.fillRect(width - 24, fasciaHeight + 30, 16, 26);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    if (style.fascia === 'band' || style.fascia === 'blade') {
      ctx.fillStyle = style.panel;
      ctx.fillRect(0, 4, width, fasciaHeight - 8);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, fasciaHeight - 4, width, 4);
      const align = style.fascia === 'blade' ? 'left' : 'center';
      const room = style.fascia === 'blade' ? width - 90 : width - 32;
      const size = sizedType(ctx, name, style.weight, style.face, style.tracking, room, 34);
      ctx.fillStyle = style.ink;
      ctx.font = `${style.weight} ${size}px ${FONTS[style.face]}`;
      const baseline = 4 + (fasciaHeight - 8) / 2 + 1;
      if (align === 'left') {
        trackedType(ctx, name, 18, baseline, style.tracking);
        // A small enamel plate at the far end of the band.
        ctx.fillStyle = style.ink;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(width - 58, baseline - 9, 34, 18);
        ctx.globalAlpha = 1;
        ctx.fillStyle = style.panel;
        ctx.font = `700 10px ${FONTS.mono}`;
        ctx.fillText('OPEN', width - 41, baseline + 1);
      } else {
        const lineWidth = trackedWidth(ctx, name, style.tracking);
        trackedType(ctx, name, width / 2 - lineWidth / 2, baseline, style.tracking);
      }
    } else if (style.fascia === 'panel') {
      const panelWidth = Math.min(width - 44, 70 + name.length * 13);
      const left = 16;
      ctx.fillStyle = 'rgba(10,14,16,0.35)';
      ctx.fillRect(left + 3, 11, panelWidth, 30);
      ctx.fillStyle = style.panel;
      ctx.fillRect(left, 8, panelWidth, 30);
      ctx.strokeStyle = style.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(left + 5, 12, panelWidth - 10, 22);
      const size = sizedType(ctx, name, style.weight, style.face, style.tracking, panelWidth - 26, 26);
      ctx.fillStyle = style.ink;
      ctx.font = `${style.weight} ${size}px ${FONTS[style.face]}`;
      const lineWidth = trackedWidth(ctx, name, style.tracking);
      trackedType(ctx, name, left + panelWidth / 2 - lineWidth / 2, 24, style.tracking);
    } else {
      // Outline: the name drawn straight onto the wall, with a rule beneath it.
      const size = sizedType(ctx, name, style.weight, style.face, style.tracking, width - 70, 40);
      ctx.font = `${style.weight} ${size}px ${FONTS[style.face]}`;
      const lineWidth = trackedWidth(ctx, name, style.tracking);
      ctx.strokeStyle = style.ink;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.92;
      trackedStroke(ctx, name, width / 2 - lineWidth / 2, 26, style.tracking);
      ctx.globalAlpha = 1;
      ctx.fillStyle = style.panel;
      ctx.fillRect(width / 2 - lineWidth / 2 - 6, 40, lineWidth + 12, 3);
    }

    // Grime along the pavement line and a soft shadow under the fascia.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, height - 7, width, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, fasciaHeight, width, 6);

    return { map: finish(canvas, null), name, style: style.fascia, accent: style.panel, family: 'shop' };
  });
}

/** A big flat sign with a word on it, for landmark fascia and rooftop boards. */
export function createSignTexture(text, options = {}) {
  const width = options.width ?? 512;
  const height = options.height ?? 128;
  const canvas = canvasOf(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = options.background ?? '#101d24';
  ctx.fillRect(0, 0, width, height);
  if (options.frame !== false) {
    ctx.strokeStyle = options.border ?? 'rgba(255,122,77,0.85)';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, width - 16, height - 16);
  }
  ctx.fillStyle = options.colour ?? '#fff3df';
  const face = FONTS[options.face] ?? FONTS.sans;
  const weight = options.weight ?? 800;
  const tracking = options.tracking ?? 0.02;
  const label = options.upper === false ? text : text.toUpperCase();
  const size = options.size ?? Math.round(height * 0.52);
  ctx.font = `${weight} ${size}px ${face}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const step = tracking * size;
  const total = trackedWidth(ctx, label, tracking);
  let cursor = (width - total) / 2;
  for (const glyph of label) {
    ctx.fillText(glyph, cursor, height / 2 + 2);
    cursor += ctx.measureText(glyph).width + step;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A soft round smudge used as a contact shadow under a car or a walker. */
export function createContactPatch() {
  const size = 128;
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,0.62)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.34)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
