// Turns a chat message into a command run. In order:
//   1. unknown commands, and admin commands from non-admins, are ignored silently
//   2. ?remote: an admin's commands use another server's data (replies stay here)
//   3. economy commands refuse guests once, then ignore them for 12 hours
//   4. cooldowns (admins skip them)
//   5. the command runs; anything that goes wrong is logged to the console only
import { formatWait } from './duration.js';

const GUEST_BLOCK = 12 * 3_600_000;
const GUEST_REPLY = 'Guest accounts are unable to use economy commands';
const FAILED_REPLY = '💥 Something went wrong (and not the fun kind of explosion).';

export function createRouter({ prefix, commands, servers, db, cooldowns }) {
  const byName = new Map();
  for (const cmd of commands) for (const n of [cmd.name, ...(cmd.aliases ?? [])]) byName.set(n, cmd);

  // Admin (home server + user id) → the server their commands run on.
  const remotes = new Map();
  const remoteKey = (home, userId) => `${home.key}\n${userId}`;

  async function handle(home, { channelCode, message, threadId }) {
    const text = (message.content || '').trim();
    if (!text.toLowerCase().startsWith(prefix.toLowerCase())) return;
    const [word, ...args] = text.slice(prefix.length).trim().split(/\s+/);
    const cmd = byName.get((word || '').toLowerCase());
    if (!cmd) return;

    const userId = message.user_id;
    const isAdmin = home.admins.has(userId);
    if (cmd.admin && !isAdmin) return;

    const server = (isAdmin && cmd.name !== 'remote' && remotes.get(remoteKey(home, userId))) || home;
    const remote = server !== home;
    const out = output(home, { channelCode, message, threadId }, remote && server.name, prefix);

    try {
      if (cmd.economy && !isAdmin && (await refuseGuest(home, userId, channelCode, out))) return;
      if (!isAdmin) {
        const wait = cooldowns.take(server.key, cmd, userId);
        if (wait) return await out.reply(cmd.cooldownText?.(formatWait(wait)) ?? `⏳ Slow down! Try \`${prefix}${cmd.name}\` again in ${formatWait(wait)}.`);
      }
      await cmd.run({
        prefix, args, message, isAdmin, remote, home, server, db, cooldowns, commands, servers,
        // The person running it, or null while remote: their id on this
        // server means someone else (or no one) on the other one.
        user: remote ? null : { id: userId, name: message.username, avatar: message.avatar },
        findMember: (name) => server.client.findMember(name, remote ? undefined : channelCode),
        remotes: { get: () => remotes.get(remoteKey(home, userId)) ?? null, set: (s) => remotes.set(remoteKey(home, userId), s), clear: () => remotes.delete(remoteKey(home, userId)) },
        ...out,
      });
    } catch (err) {
      console.error(`[${home.name}] ${prefix}${cmd.name} failed:`, err);
      out.reply(FAILED_REPLY).catch(() => {});
    }
  }

  // Guests get one refusal, then nothing for 12 hours. True when refused.
  async function refuseGuest(home, userId, channelCode, out) {
    if (db.blockedUntil(home.key, userId) > Date.now()) return true;
    if (!(await home.client.isGuest(userId, channelCode))) return false;
    db.blockGuest(home.key, userId, Date.now() + GUEST_BLOCK);
    await out.reply(GUEST_REPLY);
    return true;
  }

  return { handle };
}

// Replies go where the command was typed (channel, topic or thread) as
// replies to it. While remote, every reply starts with a reminder, and an
// image that doesn't follow one of those gets the reminder before it.
function output(home, { channelCode, message, threadId }, remoteName, prefix) {
  const where = { replyTo: message.id, threadId };
  const note = remoteName ? `🛰️ *Remote: running on **${remoteName}***\n` : '';
  let noted = false;
  return {
    reply: async (content) => {
      noted = true;
      home.client.send(channelCode, note + content, where);
    },
    replyImage: async (buffer, filename, mime) => {
      if (note && !noted) home.client.send(channelCode, note.trim(), where);
      noted = false;
      await home.client.sendImage(channelCode, buffer, filename, mime, where);
    },
    notHere: async () => {
      noted = true;
      home.client.send(channelCode, `${note}🛰️ That one acts on you, so it can't run remotely. Name someone instead, or type \`${prefix}remote\` to come back.`, where);
    },
  };
}
