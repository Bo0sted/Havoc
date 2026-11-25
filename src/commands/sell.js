import { formatMoney } from '../items.js';
import { findTool } from '../tools.js';
import { TIERS, choose, describe } from '../storage.js';
import { gained, lost } from '../colors.js';
import { drawCharm, kickedIn } from '../charms.js';
import { matchAnswer } from '../answers.js';

// ?sell settings: on/off choices saved on the seller's profile, all off by
// default. `on` / `off` say what each means for selling.
const SETTINGS = {
  legendary: {
    description: (p) => `Whether legendary items should be automatically sold when you use ${p}sell all`,
    on: (p) => `\`${p}sell all\` sells your legendaries too`,
    off: (p) => `\`${p}sell all\` keeps your legendaries`,
  },
};

export default {
  name: 'sell',
  category: 'economy',
  usage: ['<item> [amount|all]', '<category>', 'all', 'settings'],
  description: `sell from your Backpack; categories: ${[...TIERS].join(', ')} (selling all keeps legendaries unless you change it in settings)`,
  cooldown: 5_000,
  economy: true,
  async run({ prefix, args, user, server, db, track, reply, notHere }) {
    if (!user) return notHere();
    if (['settings', 'setting'].includes(args[0]?.toLowerCase())) return reply(settings(prefix, args.slice(1), db, server, user));
    return sellFrom('backpack', args, { prefix, user, server, db, track, reply });
  },
};

// `?sell settings` lists them, `?sell settings <name>` shows one,
// `?sell settings <name> on|off` changes it.
function settings(prefix, [name, value, ...extra], db, server, user) {
  const mine = db.sellSettings(server.key, user.id);
  const list = Object.entries(SETTINGS).map(([id, s]) =>
    `\`${prefix}sell settings ${id} on|off\` (now ${mine.has(id) ? 'on' : 'off'}) · ${s.description(prefix)}`);
  const menu = `⚙️ **Sell settings**\n${list.join('\n')}`;
  if (!name) return menu;
  const id = matchAnswer(name, Object.keys(SETTINGS));
  if (!id) return `There's no sell setting called **${name}**.\n\n${menu}`;

  const setting = SETTINGS[id];
  const now = mine.has(id);
  if (!value) return `${setting[now ? 'on' : 'off'](prefix)}. Turn it ${now ? 'off' : 'on'} with \`${prefix}sell settings ${id} ${now ? 'off' : 'on'}\`.`;
  const want = !extra.length && matchAnswer(value, ['on', 'off']);
  if (!want) return `Usage: \`${prefix}sell settings ${id} on|off\``;
  return db.setSellSetting(server.key, user.id, id, want === 'on')
    ? `✅ Saved: ${setting[want](prefix)}.`
    : `Already ${want}: ${setting[want](prefix)}.`;
}

// ?sell (the Backpack) and ?safe sell (the safe) work the same way.
export function sellFrom(place, args, { prefix, user, server, db, track, reply }) {
  const command = place === 'safe' ? 'safe sell' : 'sell';
  const where = place === 'safe' ? ' in your safe' : '';
  const box = place === 'safe' ? 'safe' : 'Backpack';
  const usage = `Usage: \`${prefix}${command} <item> [amount|all]\`, \`${prefix}${command} <category>\` or \`${prefix}${command} all\``;
  if (!args.length) return reply(usage);

  // Working tools aren't in the Backpack and can't be sold (broken ones can).
  const text = args.join(' ');
  const tool = !/^broken\b/i.test(text) && findTool(text);
  if (tool && db.tool(server.key, user.id, tool.kind)?.item === tool.id) return reply('Why would you wanna sell your own tools?');

  // ?sell all keeps legendaries unless the seller turned that off; ?safe sell all always does.
  const keepLegendaries = place === 'safe' || !db.sellSettings(server.key, user.id).has('legendary');
  const { lots, error, usage: badAmount, keptLegendaries } = choose(args, db.items(server.key, user.id, place), { allKeepsLegendaries: keepLegendaries, where, verb: 'sold' });
  if (badAmount) return reply(usage);
  if (error) return reply(error);
  const instead = place === 'safe' ? '' : `, or use \`${prefix}sell settings legendary on\` to include them`;
  const kept = keptLegendaries ? ` Legendaries stay in your ${box}: sell those by name${instead}.` : '';
  if (!lots.length) return reply(`Nothing to sell.${kept}`);

  // Midas Touch doubles one of the most valuable item sold, Haunted Pawn
  // Ticket halves it (only once the sale has an epic or legendary in it).
  const top = lots.reduce((best, l) => (l.item.price > best.item.price ? l : best));
  const drawn = drawCharm(db, server.key, user.id, { use: 'sell', valuable: lots.some((l) => ['epic', 'legendary'].includes(l.item.tier)) });
  const change = { midas_touch: top.item.price, haunted_pawn_ticket: -Math.floor(top.item.price / 2) }[drawn?.charm.id] ?? 0;
  const cents = lots.reduce((sum, l) => sum + l.item.price * l.qty, 0) + change;
  const ok = db.sell(server.key, user.id, lots.map((l) => ({ item: l.item.id, qty: l.qty })), cents, place);
  if (!ok) return reply(`Your ${box} changed while I was counting. Try again.`);
  // Catches were counted as earned when caught: selling only turns them into cash.
  track.moved();
  drawn?.use();
  track.earned('charms', change);
  track.lost('charms', -change);
  const charmed = !drawn ? '' : change > 0
    ? `${kickedIn(drawn.charm)} One ${top.item.emoji} ${top.item.name} sold for double (${gained(change)} extra).\n`
    : `${kickedIn(drawn.charm)} One ${top.item.emoji} ${top.item.name} sold for half (${lost(-change)} less).\n`;
  return reply(`${charmed}💰 Sold ${describe(lots)} for ${gained(cents)}. You now have ${formatMoney(db.cents(server.key, user.id))}.${kept}`);
}
