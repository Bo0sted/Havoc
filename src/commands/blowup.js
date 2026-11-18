import sharp from 'sharp';
import { explodeAvatar } from '../explode.js';
import { cooldown } from '../cooldown.js';

const onCooldown = cooldown(15_000);
const MAX_BYTES = 15 * 1024 * 1024;

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
// (png, jpeg, gif, webp, avif, tiff...); anything else gives null.
async function loadImage(haven, path) {
  try {
    const res = await fetch(haven.absoluteUrl(path));
    if (!res.ok || Number(res.headers.get('content-length')) > MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return null;
    const meta = await sharp(buf, { animated: false }).metadata();
    return meta.width && meta.height ? buf : null;
  } catch {
    return null;
  }
}

export default {
  name: 'blowup',
  aliases: ['explode', 'boom'],
  description: 'blow up someone\'s profile picture, or an attached image: blowup @user',
  async run({ haven, channelCode, message, reply, replyImage, prefix }) {
    const wait = onCooldown(message.user_id);
    if (wait) return reply(`💣 Still reloading the TNT. Try again in ${wait}s.`);

    const { paths, text } = attachmentsOf(message.content);

    // Attached files win over names: use the first one that is a picture.
    if (paths.length) {
      for (const path of paths) {
        const picture = await loadImage(haven, path);
        if (!picture) continue;
        await reply(`💥 **${message.username}** blew it up!`);
        return replyImage(await explodeAvatar(picture, message.username), 'boom.gif', 'image/gif');
      }
      return reply('🤷 None of those files are pictures I can blow up.');
    }

    const args = text.trim().slice(prefix.length).trim().split(/\s+/).slice(1);
    let target = { id: message.user_id, name: message.username, avatar: message.avatar };
    const query = args.join(' ').replace(/^@/, '').trim();
    if (query) {
      // Display names can have spaces, so try the whole thing before just
      // the first word.
      target = await haven.findMember(channelCode, query)
        ?? await haven.findMember(channelCode, args[0].replace(/^@/, ''));
      if (!target) return reply(`🤷 I can't find anyone called **${query}** here.`);
    }

    let picture = null;
    if (target.avatar) picture = await loadImage(haven, target.avatar);
    const gif = await explodeAvatar(picture, target.name);
    const line = target.id === message.user_id
      ? `💥 **${message.username}** blew themselves up.`
      : `💥 **${message.username}** blew up **${target.name}**!`;
    await reply(line);
    return replyImage(gif, 'boom.gif', 'image/gif');
  },
};
