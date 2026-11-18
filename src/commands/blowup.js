import sharp from 'sharp';
import { explodeAvatar, MAX_PIXELS } from '../explode.js';
import { findTarget } from '../members.js';

const MAX_BYTES = 15 * 1024 * 1024;
const TOO_BIG = 'Image too big';

// Haven writes each attachment into the message text on its own line:
//   /uploads/abc.png                        a picture
//   spoiler-img:/uploads/abc.png            a spoilered picture
//   [file:name.zip](/uploads/abc.zip|2 MB)  any other file
const ATTACHMENT_RE = /^(?:spoiler-img:)?(\/uploads\/\S+)$|^\[file:[^\]]*\]\((\/uploads\/[^|)]+)(?:\|[^)]*)?\)$/;

function attachmentsOf(content) {
  const paths = [];
  const text = [];
  for (const line of String(content || '').split('\n')) {
    const m = ATTACHMENT_RE.exec(line.trim());
    if (m) paths.push(m[1] || m[2]);
    else text.push(line);
  }
  return { paths, text: text.join(' ') };
}

// Downloads an attachment and returns it if sharp can read it as a picture
// (png, jpeg, gif, webp, avif, tiff...); anything else gives null, and a
// picture over the size limits gives TOO_BIG. Only the header is read to
// check the size, so a huge one is never decoded.
async function loadImage(haven, path) {
  try {
    const res = await fetch(haven.absoluteUrl(path));
    if (!res.ok) return null;
    if (Number(res.headers.get('content-length')) > MAX_BYTES) return TOO_BIG;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return TOO_BIG;
    const meta = await sharp(buf, { animated: false, limitInputPixels: false }).metadata();
    if (!meta.width || !meta.height) return null;
    return meta.width * meta.height > MAX_PIXELS ? TOO_BIG : buf;
  } catch {
    return null;
  }
}

export default {
  name: 'blowup',
  aliases: ['explode', 'boom'],
  category: 'fun',
  usage: '[@user]',
  description: 'blow up a profile picture, or an image you attach',
  cooldown: 15_000,
  cooldownText: (wait) => `💣 Still reloading the TNT. Try again in ${wait}.`,
  async run({ prefix, message, user, home, server, findMember, reply, replyImage, notHere }) {
    const { paths, text } = attachmentsOf(message.content);

    // Attached files win over names: use the first one that is a picture.
    // They were uploaded where the command was typed, so they're fetched there.
    if (paths.length) {
      for (const path of paths) {
        const picture = await loadImage(home.client, path);
        if (!picture) continue;
        if (picture === TOO_BIG) return reply(TOO_BIG);
        await reply(`💥 **${message.username}** blew it up!`);
        return replyImage(await explodeAvatar(picture, message.username), 'boom.gif', 'image/gif');
      }
      return reply('None of those files are pictures I can blow up.');
    }

    const args = text.trim().slice(prefix.length).trim().split(/\s+/).slice(1);
    let target = user;
    if (args.length) {
      const found = await findTarget(findMember, args);
      if (!found.member) return reply(`I can't find anyone called **${found.query}** here.`);
      target = found.member;
    }
    if (!target) return notHere();

    const picture = target.avatar ? await loadImage(server.client, target.avatar) : null;
    if (picture === TOO_BIG) return reply(TOO_BIG);
    const gif = await explodeAvatar(picture, target.name);
    await reply(target.id === user?.id
      ? `💥 **${message.username}** blew themselves up.`
      : `💥 **${message.username}** blew up **${target.name}**!`);
    return replyImage(gif, 'boom.gif', 'image/gif');
  },
};
