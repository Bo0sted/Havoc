// Draws the wheels' art (assets/wheel/<name>.png) from src/wheel.js. Run it
// on a machine with the Noto Sans and Noto Color Emoji fonts (npm run
// wheel-art) whenever a slice's emoji, label, colour or order changes, and
// commit the result. The bot itself only rotates these pictures, so the
// server it runs on needs no fonts.
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { WHEELS, artFingerprint } from '../src/wheel.js';
import { ART_SIZE, ART_RADIUS } from '../src/wheel-gif.js';

const OUT = new URL('../assets/wheel/', import.meta.url);
const C = ART_SIZE / 2;
const R = ART_RADIUS;

// A point on the wheel: `deg` clockwise from the top, `r` from the middle.
const at = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
};

const text = (markup) => sharp({ text: { text: markup, rgba: true, dpi: 72 } }).png().toBuffer();
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// A label with a dark shadow, so it reads on every slice colour, no wider than `max`.
async function label(words, max, size = 14) {
  const white = await text(`<span foreground="white" font_desc="Noto Sans Bold ${size}">${escape(words)}</span>`);
  const black = await text(`<span foreground="#000000aa" font_desc="Noto Sans Bold ${size}">${escape(words)}</span>`);
  const { width, height } = await sharp(white).metadata();
  const tile = await sharp({ create: { width: width + 2, height: height + 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: black, left: 2, top: 2 }, { input: white, left: 0, top: 0 }]).png().toBuffer();
  return width + 2 > max ? sharp(tile).resize({ width: max }).png().toBuffer() : tile;
}

// One slice's emoji and label in a row, reading outwards from the middle,
// on a square the size of the wheel (so rotating it turns it about the middle).
// A slice without an emoji drawn (none, or `bare`) has its label further
// out instead. `size` is the label's font size (14 unless the slice says).
async function spoke(slice) {
  const canvas = () => sharp({ create: { width: ART_SIZE, height: ART_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  if (!slice.emoji || slice.bare) {
    const words = await label(slice.label, 96, slice.size);
    const w = await sharp(words).metadata();
    return canvas().composite([{ input: words, left: Math.round(C + 112 - w.width / 2), top: Math.round(C - w.height / 2) }]).png().toBuffer();
  }
  const emoji = await sharp(await text(`<span font="Noto Color Emoji 24">${slice.emoji}</span>`)).resize({ height: 26 }).png().toBuffer();
  const words = await label(slice.label, 74, slice.size);
  const e = await sharp(emoji).metadata();
  const w = await sharp(words).metadata();
  return canvas()
    .composite([
      { input: words, left: Math.round(C + 92 - w.width / 2), top: Math.round(C - w.height / 2) },
      { input: emoji, left: Math.round(C + R - 22 - e.width / 2), top: Math.round(C - e.height / 2) },
    ]).png().toBuffer();
}

async function draw(name, slices) {
  const step = 360 / slices.length;
  const wedges = slices.map((s, i) => {
    const [x0, y0] = at(i * step, R);
    const [x1, y1] = at((i + 1) * step, R);
    return `<path d="M${C} ${C} L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} Z" fill="${s.color}" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1.5"/>`;
  }).join('');
  const pegs = slices.map((_, i) => { const [x, y] = at(i * step, R - 4); return `<circle cx="${x}" cy="${y}" r="3" fill="#fde68a"/>`; }).join('');
  const rim = name === 'paid' ? '#facc15' : '#e5e7eb';
  const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${ART_SIZE}" height="${ART_SIZE}">
    ${wedges}<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="${rim}" stroke-width="5"/>${pegs}</svg>`);

  const spokes = await Promise.all(slices.map(async (s, i) => {
    const turned = await sharp(await spoke(s)).rotate((i + 0.5) * step - 90, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const m = await sharp(turned).metadata();
    const left = Math.round((m.width - ART_SIZE) / 2);
    const top = Math.round((m.height - ART_SIZE) / 2);
    return sharp(turned).extract({ left, top, width: ART_SIZE, height: ART_SIZE }).png().toBuffer();
  }));

  const png = await sharp(base).composite(spokes.map((input) => ({ input }))).png().toBuffer();
  writeFileSync(new URL(`${name}.png`, OUT), png);
  writeFileSync(new URL(`${name}.json`, OUT), `${JSON.stringify({ fingerprint: artFingerprint(slices) })}\n`);
  console.log(`assets/wheel/${name}.png`);
}

mkdirSync(OUT, { recursive: true });
for (const [name, slices] of Object.entries(WHEELS)) await draw(name, slices);
