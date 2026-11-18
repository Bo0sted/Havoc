import sharp from 'sharp';
import { attachmentsOf } from '../attachments.js';
import { everywhere } from '../everywhere.js';

const MAX_BYTES = 25 * 1024 * 1024;
// Haven takes jpeg, png, gif and webp, up to a size each server's admin
// picks (1 MB at the least). Anything else, or bigger, is shrunk to fit.
const FITS_BYTES = 1024 * 1024;
const MIMES = { jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
const SIZES = [512, 256];

// The attached picture, ready for every server, or null if it isn't one.
async function prepare(client, path) {
  try {
    const res = await fetch(client.absoluteUrl(path));
    if (!res.ok || Number(res.headers.get('content-length')) > MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return null;
    const { format, width } = await sharp(buf).metadata();
    if (!width) return null;
    if (MIMES[format] && buf.length <= FITS_BYTES) return { buffer: buf, filename: `pfp.${format}`, mime: MIMES[format] };
    // webp keeps transparency and animation.
    for (const size of SIZES) {
      const out = await sharp(buf, { animated: true })
        .resize(size, size, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      if (out.length <= FITS_BYTES) return { buffer: out, filename: 'pfp.webp', mime: MIMES.webp };
    }
    return null;
  } catch {
    return null;
  }
}

export default {
  name: 'pfp',
  usage: '(attach an image)',
  description: "set Havoc's profile picture on every server",
  admin: true,
  async run({ message, home, servers, reply, replyEditable }) {
    const { paths } = attachmentsOf(message.content);
    if (!paths.length) return reply('Attach the picture to use, in the same message as the command.');
    let picture = null;
    for (const path of paths) if ((picture = await prepare(home.client, path))) break;
    if (!picture) return reply("That doesn't look like a picture I can use.");
    return everywhere({ servers, replyEditable }, { emoji: '🖼️', doing: 'Setting the PFP', done: 'Updated the PFP' },
      (server) => server.client.setAvatar(picture.buffer, picture.filename, picture.mime));
  },
};
