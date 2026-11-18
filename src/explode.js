// "Explodes" a profile picture: the middle swells out and the rest stretches
// around it, like ImageMagick's `-implode` with a negative amount. The GIF
// ramps the warp up and then holds the fully exploded picture.
import sharp from 'sharp';
import gifenc from 'gifenc';

const { GIFEncoder, quantize, applyPalette } = gifenc;

const SIZE = 256;
const FRAMES = 14;
const MAX_AMOUNT = 5; // how far it bulges at the end; higher = more warped

async function loadPicture(input) {
  return sharp(input, { animated: false })
    .resize(SIZE, SIZE, { fit: 'cover' })
    .flatten({ background: '#1e1f22' }) // transparent avatars get a dark backing
    .raw()
    .toBuffer();
}

// A plain stand-in for people without a profile picture: a person
// silhouette on a colour picked from their name. It has no text on purpose,
// so no fonts are ever loaded (that printed pages of fontconfig warnings).
function placeholderPicture(name) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 256 256">
      <rect width="256" height="256" fill="hsl(${hue},55%,45%)"/>
      <circle cx="128" cy="100" r="46" fill="#fff"/>
      <path d="M44 236c0-50 38-82 84-82s84 32 84 82z" fill="#fff"/>
    </svg>`
  );
}

// Bilinear sample of the RGB source at a fractional position.
function sample(src, x, y, out, o) {
  x = Math.max(0, Math.min(SIZE - 1.001, x));
  y = Math.max(0, Math.min(SIZE - 1.001, y));
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
  const i00 = (y0 * SIZE + x0) * 3, i10 = i00 + 3, i01 = i00 + SIZE * 3, i11 = i01 + 3;
  for (let c = 0; c < 3; c++) {
    const top = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * fx;
    const bottom = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * fx;
    out[o + c] = top + (bottom - top) * fy;
  }
  out[o + 3] = 255;
}

function warp(src, amount) {
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  const c = (SIZE - 1) / 2;
  const radius = SIZE * 0.72; // reaches past the corners, so nothing stays untouched
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - c, dy = y - c;
      const d = Math.hypot(dx, dy) / radius;
      // Inside the circle, read from closer to the middle, so the middle is
      // blown up and everything near the edge gets pulled out of shape.
      const k = d < 1 ? Math.sin((Math.PI / 2) * d) ** amount : 1;
      sample(src, c + dx * k, c + dy * k, out, (y * SIZE + x) * 4);
    }
  }
  return out;
}

export async function explodeAvatar(input, name = '?') {
  const src = await loadPicture(input || placeholderPicture(name));
  const gif = GIFEncoder();
  for (let f = 0; f < FRAMES; f++) {
    const t = f / (FRAMES - 1);
    const px = warp(src, MAX_AMOUNT * t * t); // eases in, then snaps hard
    const palette = quantize(px, 256);
    const delay = f === 0 ? 400 : f === FRAMES - 1 ? 2000 : 60;
    gif.writeFrame(applyPalette(px, palette), SIZE, SIZE, { palette, delay });
  }
  gif.finish();
  return Buffer.from(gif.bytes());
}
