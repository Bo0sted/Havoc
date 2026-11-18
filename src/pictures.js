// Downloads a picture from an API for re-uploading. Gifs go up as they are;
// photos are shrunk so the server's disk isn't filled with 4000px animals.
import sharp from 'sharp';
import { fetchOk, getJson } from './web.js';
import { MAX_PIXELS } from './explode.js';

export async function fetchPicture(url, name) {
  const img = Buffer.from(await (await fetchOk(url)).arrayBuffer());
  if (url.toLowerCase().endsWith('.gif') && img.length < 4_000_000) {
    return { buffer: img, filename: `${name}.gif`, mime: 'image/gif' };
  }
  const jpg = await sharp(img, { limitInputPixels: MAX_PIXELS })
    .rotate().resize(640, 640, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  return { buffer: jpg, filename: `${name}.jpg`, mime: 'image/jpeg' };
}

// A command that posts a random picture from a JSON API: `pick` takes the
// picture's URL out of the API's answer.
export function pictureCommand({ name, api, pick, description, cooldownText }) {
  return {
    name,
    category: 'fun',
    description,
    cooldown: 5_000,
    rateLimit: { max: 30, per: 60_000 }, // no published limit: a courtesy cap
    cooldownText,
    async run({ replyImage }) {
      const { buffer, filename, mime } = await fetchPicture(pick(await getJson(api)), name);
      return replyImage(buffer, filename, mime);
    },
  };
}

