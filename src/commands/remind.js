import { parseWhen, whenProblem, preview, MAX_TEXT, MAX_REMINDERS } from '../reminders.js';

const sec = (ms) => Math.floor(ms / 1000);

const usage = (prefix) => [
  '⏰ **Reminders**',
  `\`${prefix}remind <time> <text>\` · I remind you here at that time, e.g. \`${prefix}remind 2hr take the trash out\``,
  'Time: `30min`, `2hr`, `3d`, `1w`, or a timestamp like `<t:1795454881:F>` or `1795454881`, up to 30 days ahead',
  `\`${prefix}remind list\` · your reminders, numbered`,
  `\`${prefix}remind delete <number|first words>\` · cancel one`,
  `\`${prefix}snooze [time]\` · push your latest reminder back (1 hour if no time)`,
].join('\n');

// The command's text after its first `n` words, as typed (line breaks kept).
const after = (text, n) => text.split(/(\s+)/).slice(n * 2).join('').trim();
const squash = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase();

function where(client, r) {
  if (r.place === 'dm') return 'DM';
  if (r.place === 'group') return 'group DM';
  const name = client.channelById(r.channel_id)?.name;
  const channel = name ? `#${name}` : 'a channel';
  return r.thread_id ? `${channel} (thread)` : channel;
}

// A DM reminder's text stays out of lists shown anywhere else (a 1:1 DM is
// private, so everything shows there).
const hidden = (r, here) => r.place !== 'channel' && r.channel_id !== here.id && !(here.dm && !here.dm.group);

export default {
  name: 'remind',
  aliases: ['reminder'],
  category: 'utility',
  usage: ['<time> <text>', 'list', 'delete <number|first words>'],
  description: 'a reminder here at a time (2hr, 3d, 1w or a timestamp, up to 30 days ahead)',
  cooldown: 3_000,
  dm: true,
  async run(ctx) {
    const { prefix, args, user, reply, notHere } = ctx;
    if (!args.length) return reply(usage(prefix));
    if (!user) return notHere();
    // Everything after the prefix, as typed.
    const typed = ctx.message.content.trim().slice(prefix.length).trim();
    const here = { dm: ctx.dm, id: ctx.dm?.id ?? ctx.channel?.id };
    const sub = args[0].toLowerCase();
    if (sub === 'list') return list(ctx, here);
    if (sub === 'delete') return remove(ctx, here, after(typed, 2));
    return create(ctx, typed);
  },
};

async function create({ prefix, args, channel, threadId, dm, server, db, user, reminders, isGuest, reply }, typed) {
  const when = parseWhen(args);
  if (!when) return reply(`That's not a time I understand. Try \`${prefix}remind 2hr take the trash out\`, or \`${prefix}remind\` for every kind of time.`);
  const problem = whenProblem(when.at);
  if (problem) return reply(problem);
  const text = after(typed, 1 + when.used);
  if (!text) return reply(`What should I remind you about? For example \`${prefix}remind ${args.slice(0, when.used).join(' ')} take the trash out\``);
  if (text.length > MAX_TEXT) return reply(`That's ${text.length.toLocaleString('en-US')} characters. A reminder can be ${MAX_TEXT.toLocaleString('en-US')} at most.`);
  // A guest's account is gone soon after they leave, so nobody would get it.
  if (!dm && (await isGuest(user.id))) return reply("Guest accounts can't set reminders.");
  const place = dm ? (dm.group ? 'group' : 'dm') : 'channel';
  const reminder = { place, channelId: dm?.id ?? channel.id, threadId, text, created: Date.now(), due: when.at };
  if (!db.addReminder(server.key, user.id, reminder, MAX_REMINDERS)) {
    return reply(`You already have ${MAX_REMINDERS} reminders. Cancel one with \`${prefix}remind delete <number>\` first.`);
  }
  reminders.run();
  return reply(`⏰ Got it. I'll remind you <t:${sec(when.at)}:R> (<t:${sec(when.at)}:f>).`);
}

function list({ prefix, server, db, user, reply }, here) {
  const rows = db.reminders(server.key, user.id);
  if (!rows.length) return reply(`You have no reminders. Set one with \`${prefix}remind <time> <text>\`.`);
  const lines = rows.map((r, i) => `${i + 1}. <t:${sec(r.due)}:R> · ${where(server.client, r)} · ${hidden(r, here) ? '*DM reminder*' : preview(r.text)}`);
  return reply(`⏰ **Your reminders** (${rows.length}/${MAX_REMINDERS})\n${lines.join('\n')}`);
}

// By its number in the list, or by how its text starts. Never guesses.
function remove({ prefix, server, db, user, reminders, reply }, here, query) {
  if (!query) return reply(`Usage: \`${prefix}remind delete <number|first words>\` (the numbers are from \`${prefix}remind list\`)`);
  const rows = db.reminders(server.key, user.id);
  const byNumber = /^\d+$/.test(query);
  const picks = byNumber
    ? (rows[Number(query) - 1] ? [Number(query)] : [])
    : rows.map((r, i) => (squash(r.text).startsWith(squash(query)) ? i + 1 : 0)).filter(Boolean);
  if (!picks.length) {
    return reply(byNumber ? `You don't have a reminder number ${query}. \`${prefix}remind list\` shows them.` : `None of your reminders start with "${query}".`);
  }
  if (picks.length > 1) return reply(`Which one? Numbers ${picks.join(', ')} all start with that. Use \`${prefix}remind delete <number>\`.`);
  const r = rows[picks[0] - 1];
  db.deleteReminder(r.id);
  reminders.run();
  return reply(`🗑️ Deleted ${hidden(r, here) ? 'your DM reminder' : `"${preview(r.text)}"`} (it was due <t:${sec(r.due)}:R>).`);
}
