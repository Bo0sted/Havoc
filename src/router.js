// Turns a chat message into a command run. In order:
//   1. unknown commands, admin commands from non-admins, and in DMs anything
//      not made for DMs (`dm: true`) are ignored silently
//   2. once a server has bot channels, non-admins are ignored everywhere else
//      (DMs aside)
//   3. ?remote: an admin's commands use another server's data (replies stay here)
//   4. economy commands refuse guests once, then ignore them for 12 hours,
//      and refuse anyone in ?wheel jail (except jailFree ones like ?stats)
//   5. cooldowns (admins skip them), then the API's own limit (nobody skips it)
//   6. payday, if it's due (crew.js), and an event's gift the first time
//      someone uses one while it's on (events.js), then the command runs;
//      anything that goes wrong is logged to the console only
//   7. an economy command that gained or lost money (through `track`) counts
//      toward milestones (not while remote)
// Commands in the economy category get db.linked, which follows ?link;
// everything else gets the plain db, so a link never reaches them.
// A command waiting on an answer (awaitAnswer) sees the person's messages first.
import { formatWait } from './duration.js';
import { chunks } from './chunks.js';
import { countCommand } from './milestones.js';
import { tracker } from './earnings.js';
import { payday } from './crew.js';
import { celebrate } from './events.js';

const GUEST_BLOCK = 12 * 3_600_000;
const GUEST_REPLY = 'Guest accounts are unable to use economy commands';
const FAILED_REPLY = 'Something went wrong (and not the fun kind of explosion).';

export function createRouter({ prefix, commands, servers, db, cooldowns, reminders }) {
  const byName = new Map();
  for (const cmd of commands) for (const n of [cmd.name, ...(cmd.aliases ?? [])]) byName.set(n, cmd);

  // Admin (home server + user id) → the server their commands run on.
  const remotes = new Map();
  const remoteKey = (home, userId) => `${home.key}\n${userId}`;

  // Someone's answer in one channel/thread → the check waiting for it,
  // which returns true when it takes the message.
  const waiting = new Map();
  const answerKey = (home, channelCode, threadId, userId) => `${home.key}\n${channelCode}\n${threadId ?? ''}\n${userId}`;

  // `dm` is the DM or group DM it came from, or undefined in a server channel.
  async function handle(home, { channelCode, message, threadId, dm }) {
    const text = (message.content || '').trim();
    if (waiting.get(answerKey(home, channelCode, threadId, message.user_id))?.(text)) return;
    if (!text.toLowerCase().startsWith(prefix.toLowerCase())) return;
    const [word, ...args] = text.slice(prefix.length).trim().split(/\s+/);
    const cmd = byName.get((word || '').toLowerCase());
    if (!cmd) return;
    if (dm && !cmd.dm) return;

    const userId = message.user_id;
    const isAdmin = home.admins.has(userId);
    if (cmd.admin && !isAdmin) return;
    const channel = home.client.channel(channelCode);
    if (!isAdmin && !dm && !inBotChannel(home, channel)) return;

    const server = (isAdmin && cmd.name !== 'remote' && remotes.get(remoteKey(home, userId))) || home;
    const remote = server !== home;
    const out = output(home, { channelCode, message, threadId }, remote && server.name, prefix);
    const data = cmd.category === 'economy' ? db.linked : db;

    try {
      if (cmd.economy && !isAdmin && (await refuseGuest(home, userId, channelCode, out))) return;
      const jailed = cmd.economy && !cmd.jailFree ? data.jailedUntil(server.key, userId) - Date.now() : 0;
      if (jailed > 0) return await out.reply(`🚔 You're in jail for another ${formatWait(jailed)}. Only \`${prefix}stats\` works until then.`);
      if (!isAdmin) {
        // A subcommand can have a cooldown of its own (e.g. ?bet record).
        const timed = cmd.cooldownFor?.(args) ?? cmd;
        const wait = cooldowns.take(server.key, timed, userId);
        if (wait) return await out.reply(timed.cooldownText?.(formatWait(wait)) ?? `⏳ Slow down! Try \`${prefix}${timed.name}\` again in ${formatWait(wait)}.`);
      }
      const busy = cooldowns.takeGlobal(cmd);
      if (busy) return await out.reply(`⏳ Everyone wants \`${prefix}${cmd.name}\` right now! It's free again in ${formatWait(busy)}.`);
      const paid = cmd.economy && !remote && payday(data, server.key, userId);
      if (paid) await out.reply(paid);
      const gift = cmd.economy && !remote && celebrate(data, server.key, userId);
      if (gift) await gift(out);
      const track = tracker(data, server.key, userId);
      await cmd.run({
        cmd, prefix, args, message, channel, threadId, dm: dm ?? null, isAdmin, remote, home, server, db: data, cooldowns, commands, servers, track, reminders,
        // The person running it, or null while remote: their id on this
        // server means someone else (or no one) on the other one.
        user: remote ? null : { id: userId, name: message.username, avatar: message.avatar },
        findMember: (name) => server.client.findMember(name, remote ? undefined : channelCode),
        isGuest: (id) => server.client.isGuest(id, remote ? undefined : channelCode),
        // Resolves with this person's next message here that `accepts`
        // takes, or null after `ms`. Other messages go on as usual.
        awaitAnswer: (accepts, ms) => new Promise((resolve) => {
          const key = answerKey(home, channelCode, threadId, userId);
          const check = (answer) => accepts(answer) && (finish(answer), true);
          const finish = (value) => {
            clearTimeout(timer);
            if (waiting.get(key) === check) waiting.delete(key);
            resolve(value);
          };
          const timer = setTimeout(() => finish(null), ms);
          waiting.set(key, check);
        }),
        remotes: { get: () => remotes.get(remoteKey(home, userId)) ?? null, set: (s) => remotes.set(remoteKey(home, userId), s), clear: () => remotes.delete(remoteKey(home, userId)) },
        ...out,
      });
      if (cmd.economy && track.didMove && !remote) await milestone(home, { channelCode, message, threadId });
    } catch (err) {
      console.error(`[${home.name}] ${prefix}${cmd.name} failed:`, err);
      out.reply(FAILED_REPLY).catch(() => {});
    }
  }

  // A milestone reached is paid at once and announced with a ping: its own
  // message (not a reply, not silent) where the command was typed.
  async function milestone(home, { channelCode, message, threadId }) {
    const congrats = countCommand(db.linked, home.key, message.user_id);
    if (!congrats) return;
    const login = await home.client.loginName(message.user_id, channelCode);
    home.client.send(channelCode, congrats(`@${login ?? message.username}`), { threadId, silent: false });
  }

  // With no bot channels set, every channel counts.
  function inBotChannel(home, channel) {
    const ids = db.botChannels(home.key);
    return !ids.length || ids.includes(channel?.id);
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
    // `content` is text, or a list of sections that each stay on one page.
    reply: async (content) => {
      noted = true;
      const text = Array.isArray(content) ? [note + content[0], ...content.slice(1)] : note + content;
      for (const piece of chunks(text)) home.client.send(channelCode, piece, where);
    },
    // A reply that can be changed later: resolves with edit(content). If
    // the edit can't happen, the new text is sent as a reply to the command,
    // unless it's only progress ({ quiet: true }), which is dropped instead.
    replyEditable: async (content) => {
      noted = true;
      const id = await home.client.sendForEdit(channelCode, note + content, where);
      return async (next, { quiet = false } = {}) => {
        if (id && (await home.client.edit(channelCode, id, note + next))) return;
        if (!quiet) home.client.send(channelCode, note + next, where);
      };
    },
    replyImage: async (buffer, filename, mime) => {
      if (note && !noted) home.client.send(channelCode, note.trim(), where);
      noted = false;
      await home.client.sendImage(channelCode, buffer, filename, mime, where);
    },
    // An image that's the same every time (`key`): uploaded once, then reposted.
    replyImageOnce: async (key, buffer, filename, mime) => {
      if (note && !noted) home.client.send(channelCode, note.trim(), where);
      noted = false;
      await home.client.sendImageOnce(channelCode, key, buffer, filename, mime, where);
    },
    // A message that notifies `member` ({ id, name }): its own message where
    // the command was typed, not silent and not a reply (a reply would
    // notify the person who typed the command too). `build` gets the @mention.
    ping: async (member, build) => {
      const login = await home.client.loginName(member.id, channelCode);
      home.client.send(channelCode, note + build(`@${login ?? member.name}`), { threadId, silent: false });
    },
    notHere: async () => {
      noted = true;
      home.client.send(channelCode, `${note}That one acts on you, so it can't run remotely. Name someone instead, or type \`${prefix}remote\` to come back.`, where);
    },
  };
}
