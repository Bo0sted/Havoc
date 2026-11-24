import { randomInt } from 'node:crypto';
import { formatMoney } from '../items.js';
import { KINDS } from '../tools.js';
import { matchAnswer } from '../answers.js';
import { claimGame } from '../games.js';
import { lost } from '../colors.js';
import { JOBS, BOSS, outfitOf, hirePrice, wageLine, NAMES, crewName, finalPaycheck, nextPayday, names } from '../crew.js';

const ALIASES = { fishing: 'fish', mining: 'mine', hunting: 'hunt', deckhand: 'fish', miner: 'mine', guide: 'hunt' };
const stamp = (ms) => Math.ceil(ms / 1000);
const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

export default {
  name: 'crew',
  category: 'economy',
  usage: ['', 'hire <fish|mine|hunt> [name]', 'fire <name>', 'rename <name> <new name>'],
  description: `deckhands, miners and hunting guides who catch alongside you and share your risk of the hospital (with ${BOSS} able to work you're the boss and can't get hurt); they need Workers' Comp from the shop and are paid once a day`,
  cooldown: 5_000,
  economy: true,
  async run({ prefix, args, user, server, db, track, reply, notHere, awaitAnswer }) {
    if (!user) return notHere();
    const [action, ...rest] = args;
    const ctx = { prefix, user, server, db, track, reply, awaitAnswer };
    switch (action?.toLowerCase()) {
      case undefined: return reply(overview(ctx));
      case 'hire': return hire(rest, ctx);
      case 'fire': return fire(rest.join(' '), ctx);
      case 'rename': return rename(rest, ctx);
      default: return reply(usage(prefix));
    }
  },
};

const usage = (prefix) => `Usage: \`${prefix}crew\`, \`${prefix}crew hire <fish|mine|hunt> [name]\`, \`${prefix}crew fire <name>\` or \`${prefix}crew rename <name> <new name>\``;
const find = (crew, name) => crew.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());

// Each job's outfit, crew (who's hurt, and until when) and next hire, then payday.
function overview({ prefix, user, server, db }) {
  const now = Date.now();
  const crew = db.crew(server.key, user.id);
  const sections = Object.entries(JOBS).map(([job, { label, emoji, noun, start, comp }]) => {
    const { outfit, room } = outfitOf(db, server.key, user.id, job);
    const mine = crew.filter((c) => c.job === job);
    const ready = mine.filter((c) => c.hurt_until <= now).length;
    const where = outfit?.name ?? start[0].toUpperCase() + start.slice(1);
    const lines = [`${emoji} **${label}** · ${where} (${mine.length}/${room === Infinity ? '∞' : room} ${noun}s) · ${wageLine(job)} each (+${comp}% workers' comp)`];
    if (mine.length) lines.push(mine.map((c) => (c.hurt_until > now ? `${c.name} (hurt, back <t:${stamp(c.hurt_until)}:R>)` : c.name)).join(' · '));
    if (ready >= BOSS) lines.push("🧢 You're the boss here: you can't get hurt on the job.");
    lines.push(mine.length < room ? `Next hire: ${formatMoney(hirePrice(mine.length))}` : `Full: a bigger ${KINDS[JOBS[job].kind].noun} from \`${prefix}shop\` has room for more.`);
    return lines.join('\n');
  });
  const pay = nextPayday(db, server.key, user.id);
  const head = pay
    ? `💰 Payday <t:${stamp(pay.at)}:R>: ${lost(pay.wages)} in wages + ${lost(pay.comp)} workers' comp so far.`
    : crew.length ? "💰 No wages owed: payday's clock starts with your crew's next trip." : `Crew catch alongside you on every trip and take a share of your risk of the hospital. With ${BOSS} able to work in a job, you're the boss and can't get hurt.`;
  const comp = db.licenses(server.key, user.id).includes('workers_comp') ? '' : `\nYou need Workers' Comp Insurance from \`${prefix}shop\` before you can hire anyone.`;
  return [`👷 **Your crew**\n${head}${comp}`, ...sections, usage(prefix)];
}

async function hire([what = '', ...named], { prefix, user, server, db, track, reply, awaitAnswer }) {
  const job = matchAnswer(what, Object.keys(JOBS), ALIASES);
  if (!job) return reply(`Usage: \`${prefix}crew hire <fish|mine|hunt> [name]\``);
  if (!db.licenses(server.key, user.id).includes('workers_comp')) return reply(`🦺 You need Workers' Comp Insurance before you can hire anyone. Get it in \`${prefix}shop\`.`);
  const { noun, label, comp } = JOBS[job];
  const { outfit, room } = outfitOf(db, server.key, user.id, job);
  const hired = () => db.crew(server.key, user.id).filter((c) => c.job === job).length;
  if (hired() >= room) {
    return reply(`👷 ${outfit?.name ?? JOBS[job].start[0].toUpperCase() + JOBS[job].start.slice(1)} only has room for ${plural(room, noun)}. A bigger ${KINDS[JOBS[job].kind].noun} from \`${prefix}shop\` has room for more.`);
  }
  const cost = hirePrice(hired());
  if (db.cents(server.key, user.id) < cost) return reply(`Hiring another ${noun} costs ${formatMoney(cost)}. You only have ${formatMoney(db.cents(server.key, user.id))}.`);

  let name;
  if (named.length) {
    name = crewName(named.join(' '));
    if (!name) return reply("That name won't work: use letters (digits, spaces, ' . and - are fine too), up to 20 characters.");
  } else {
    const release = claimGame(server.key, user.id);
    if (!release) return;
    try {
      const taken = new Set(db.crew(server.key, user.id).map((c) => c.name.toLowerCase()));
      const left = NAMES.filter((n) => !taken.has(n.toLowerCase()));
      const offered = [];
      while (offered.length < 3 && left.length) offered.push(...left.splice(randomInt(left.length), 1));
      await reply(`👷 Pick a name for your new ${noun}: ${offered.map((n, i) => `**${i + 1}.** ${n}`).join(' · ')}\nReply with a number, or type your own name (letters, up to 20 characters).`);
      const answer = (text) => (/^[1-3]$/.test(text.trim()) ? offered[Number(text.trim()) - 1] : !text.trim().startsWith(prefix) && crewName(text));
      const said = await awaitAnswer((text) => !!answer(text), 30_000);
      if (!said) return reply('⌛ Timed out, so nobody was hired.');
      name = answer(said);
    } finally {
      release();
    }
  }
  if (find(db.crew(server.key, user.id), name)) return reply(`You already have someone called **${name}**. Pick another name.`);

  // The crew may have changed while they picked a name.
  const count = hired();
  if (count >= room) return reply(`👷 There's no room for another ${noun} anymore.`);
  const price = hirePrice(count);
  if (!db.hire(server.key, user.id, job, name, price)) return reply(`Hiring another ${noun} costs ${formatMoney(price)}. You only have ${formatMoney(db.cents(server.key, user.id))}.`);
  track.lost('crew', price);
  const boss = count + 1 === BOSS ? `\n🧢 That's ${BOSS}: you're the boss now, so you can't get hurt ${label.toLowerCase()} while they're all able to work.` : '';
  return reply(`👷 You hired **${name}** as a ${noun} for ${lost(price)}. ${label} crew: ${count + 1}/${room === Infinity ? '∞' : room}. Their wage is ${wageLine(job)} (+${comp}% workers' comp), paid every payday.${boss}`);
}

// Letting someone go pays what they're owed so far.
function fire(name, { prefix, user, server, db, reply }) {
  if (!name.trim()) return reply(`Usage: \`${prefix}crew fire <name>\``);
  const mate = find(db.crew(server.key, user.id), name);
  if (!mate) return reply(`You don't have anyone called **${name.trim()}** on your crew.`);
  return reply(`👋 You let **${mate.name}** go.${finalPaycheck(db, server.key, user.id, mate)}`);
}

// Names can have spaces, so the longest start that's someone's name is who,
// and the rest is the new name.
function rename(words, { prefix, user, server, db, reply }) {
  const crew = db.crew(server.key, user.id);
  let at = words.length - 1;
  while (at >= 1 && !find(crew, words.slice(0, at).join(' '))) at--;
  const mate = at >= 1 && find(crew, words.slice(0, at).join(' '));
  if (!mate) return reply(words.length < 2 ? `Usage: \`${prefix}crew rename <name> <new name>\`` : "You don't have anyone by that name on your crew.");
  const name = crewName(words.slice(at).join(' '));
  if (!name) return reply("That name won't work: use letters (digits, spaces, ' . and - are fine too), up to 20 characters.");
  const other = find(crew, name);
  if (other && other.id !== mate.id) return reply(`You already have someone called **${other.name}**.`);
  db.renameCrew(mate.id, name);
  return reply(`✏️ **${mate.name}** is now **${name}**.`);
}
