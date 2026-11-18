import sharp from 'sharp';
import { cooldown } from '../cooldown.js';

const onCooldown = cooldown(5_000);

export default {
  name: 'cat',
  description: 'a random cat picture',
  async run({ message, reply, replyImage }) {
    const wait = onCooldown(message.user_id);
    if (wait) return reply(`🐱 The cats are resting, try again in ${wait}s.`);

    const res = await fetch('https://api.thecatapi.com/v1/images/search');
    const [cat] = await res.json();
    const img = Buffer.from(await (await fetch(cat.url)).arrayBuffer());

    // Gifs go up as they are; photos are shrunk so the server's disk isn't
    // filled with 4000px cats.
    if (cat.url.toLowerCase().endsWith('.gif') && img.length < 4_000_000) {
      return replyImage(img, 'cat.gif', 'image/gif');
    }
    const jpg = await sharp(img).rotate().resize(640, 640, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    return replyImage(jpg, 'cat.jpg', 'image/jpeg');
  },
};
