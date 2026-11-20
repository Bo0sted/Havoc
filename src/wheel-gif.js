// The spinning-wheel GIF for ?wheel and ?bet wheel: the wheel's art
// (assets/wheel, drawn by scripts/wheel-art.js) spins fast, slows down hard
// and creeps onto the slice it lands on, under a pointer on the right. It
// plays once (about 6 seconds) and stays on the result.
//
// Only a few spins per slice are ever drawn (VARIANTS), each saved in
// out/wheel the first time it's needed, so a spin costs nothing to draw after
// that. Drawing takes a few seconds on a small server, so it happens on a
// worker thread and the bot keeps answering everyone else meanwhile.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import sharp from 'sharp';
import gifenc from 'gifenc';
import { WHEELS, artFingerprint } from './wheel.js';

const { GIFEncoder, quantize, applyPalette } = gifenc;

export const ART_SIZE = 360;
export const ART_RADIUS = 168;
const ASSETS = new URL('../assets/wheel/', import.meta.url);
const CACHE = new URL('../out/wheel/', import.meta.url);
const BACKGROUND = [30, 31, 34];

const SPIN = 6_000; // ms from the start to the stop
const HOLD = 4_000; // the last frame's delay (it stays there anyway)
// [extra full turns, where in the slice it stops (0-1)]: a few different
// spins per slice, so the same prize doesn't always look the same.
const VARIANTS = [[4, 0.3], [5, 0.5], [4, 0.7]];

// How far the wheel has turned (degrees) `t` ms into a spin of `total`:
// fast at first, then a long, slow creep (ease-out quart).
const turned = (t, total) => total * (1 - (1 - t / SPIN) ** 4);

// Frame times: short frames while it's fast, longer ones as it slows (each
// about STEP degrees on), so the GIF stays small and the end still looks smooth.
const STEP = 16;
function frameTimes(total) {
  const times = [0];
  let t = 0;
  while (t < SPIN) {
    let dt = 30;
    while (dt < 200 && t + dt < SPIN && turned(t + dt, total) - turned(t, total) < STEP) dt += 10;
    t = Math.min(SPIN, t + dt);
    times.push(t);
  }
  return times;
}

// The pointer (on the right, pointing in) and the hub, drawn once.
async function overlay() {
  const c = ART_SIZE / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ART_SIZE}" height="${ART_SIZE}">
    <polygon points="${ART_SIZE - 2},${c - 15} ${ART_SIZE - 2},${c + 15} ${ART_SIZE - 32},${c}" fill="#f8fafc" stroke="#111827" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="${c}" cy="${c}" r="24" fill="#111827" stroke="#facc15" stroke-width="4"/>
    <circle cx="${c}" cy="${c}" r="8" fill="#facc15"/></svg>`;
  return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
}

const loaded = new Map();
// A wheel's art as raw RGBA, checked against the slices it should show.
async function art(name) {
  if (loaded.has(name)) return loaded.get(name);
  const { fingerprint } = JSON.parse(readFileSync(new URL(`${name}.json`, ASSETS), 'utf8'));
  if (fingerprint !== artFingerprint(WHEELS[name])) {
    throw new Error(`assets/wheel/${name}.png doesn't match the ${name} wheel's slices: run npm run wheel-art`);
  }
  const pixels = await sharp(readFileSync(new URL(`${name}.png`, ASSETS))).ensureAlpha().raw().toBuffer();
  const result = { pixels, top: await overlay() };
  loaded.set(name, result);
  return result;
}

// One frame: the art turned `deg` clockwise on the background, with the
// pointer and hub on top.
function frame({ pixels, top }, deg) {
  const n = ART_SIZE;
  const out = new Uint8ClampedArray(n * n * 4);
  const c = (n - 1) / 2;
  const a = (-deg * Math.PI) / 180; // read from where each pixel was before turning
  const cos = Math.cos(a), sin = Math.sin(a);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const o = (y * n + x) * 4;
      const dx = x - c, dy = y - c;
      let r = BACKGROUND[0], g = BACKGROUND[1], b = BACKGROUND[2];
      if (dx * dx + dy * dy <= (ART_RADIUS + 4) ** 2) {
        const sx = c + dx * cos - dy * sin, sy = c + dx * sin + dy * cos;
        const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
        if (x0 >= 0 && y0 >= 0 && x0 < n - 1 && y0 < n - 1) {
          const i = (y0 * n + x0) * 4;
          const mix = (k) => {
            const top0 = pixels[i + k] + (pixels[i + 4 + k] - pixels[i + k]) * fx;
            const bot0 = pixels[i + n * 4 + k] + (pixels[i + n * 4 + 4 + k] - pixels[i + n * 4 + k]) * fx;
            return top0 + (bot0 - top0) * fy;
          };
          const alpha = mix(3) / 255;
          r += (mix(0) - r) * alpha; g += (mix(1) - g) * alpha; b += (mix(2) - b) * alpha;
        }
      }
      const t = top[o + 3] / 255;
      out[o] = r + (top[o] - r) * t;
      out[o + 1] = g + (top[o + 1] - g) * t;
      out[o + 2] = b + (top[o + 2] - b) * t;
      out[o + 3] = 255;
    }
  }
  return out;
}

// The GIF of `name` landing on slice `index` (spin `variant` of VARIANTS).
export async function render(name, index, variant) {
  const wheel = await art(name);
  const slices = WHEELS[name].length;
  const [turns, at] = VARIANTS[variant];
  // The pointer is at 90° (3 o'clock); land with that point of the slice under it.
  const stop = (((90 - (index + at) * (360 / slices)) % 360) + 360) % 360;
  const total = turns * 360 + stop;

  // One palette for every frame, from two frames (straight and mid-turn, so
  // the blended edges are in it too).
  const sampleA = frame(wheel, 0), sampleB = frame(wheel, 360 / slices / 2);
  const both = new Uint8ClampedArray(sampleA.length * 2);
  both.set(sampleA); both.set(sampleB, sampleA.length);
  const palette = quantize(both, 256);

  const gif = GIFEncoder();
  const times = frameTimes(total);
  times.forEach((t, f) => {
    const delay = f === times.length - 1 ? HOLD : times[f + 1] - t;
    gif.writeFrame(applyPalette(frame(wheel, turned(t, total)), palette), ART_SIZE, ART_SIZE, { palette, delay, repeat: -1 });
  });
  gif.finish();
  return Buffer.from(gif.bytes());
}

// A spin of `name` landing on slice `index`: { key, gif } where `key` names
// this exact GIF (for upload caching). Drawn once per variant, then read from out/wheel.
export async function spinGif(name, index) {
  const variant = randomInt(VARIANTS.length);
  const key = `${name}-${index}-${variant}-${artFingerprint(WHEELS[name])}`;
  const file = new URL(`${key}.gif`, CACHE);
  if (existsSync(file)) return { key, gif: () => readFileSync(file) };
  const gif = await new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { name, index, variant }, execArgv: [] });
    worker.once('message', (bytes) => resolve(Buffer.from(bytes)));
    worker.once('error', reject);
  });
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, gif);
  return { key, gif: () => gif };
}

// On the worker thread: draw the GIF asked for and hand it back.
if (!isMainThread && workerData?.name) {
  const { name, index, variant } = workerData;
  const gif = await render(name, index, variant);
  parentPort.postMessage(gif, [gif.buffer]);
}

// How long after posting the result can be told without spoiling it.
export const REVEAL = SPIN + 1_500;
