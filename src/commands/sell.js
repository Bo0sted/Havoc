import { ITEMS, itemById, formatMoney } from '../items.js';
import { findTool } from '../tools.js';

// "Gold Bar (100 g)" and "gold-bar" both become "goldbar".
const key = (text) => text.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

// The item a name means: an exact name first, else every name containing it
// (retired ones only if the seller has them). Several matches narrow to the
// ones the seller actually has.
function findItem(query, owned) {
  const q = key(query);
  if (!q) return { matches: [] };
  const exact = ITEMS.find((i) => key(i.name) === q || key(i.id) === q);
  if (exact) return { item: exact };
  const matches = ITEMS.filter((i) => key(i.name).includes(q) && (!i.retired || owned.has(i.id)));
  const mine = matches.filter((i) => owned.has(i.id));
  if (matches.length === 1) return { item: matches[0] };
  if (mine.length === 1) return { item: mine[0] };
  return { matches: mine.length ? mine : matches };
}

const label = (item, qty) => `${qty} ${item.emoji} ${item.name}`;
const TIERS = new Set(ITEMS.map((i) => i.tier));

export default {
  name: 'sell',
  category: 'economy',
  usage: ['<item> [amount|all]', '<category>', 'all'],
  description: `sell from your Safety Deposit Box; categories: ${[...TIERS].join(', ')} (selling all keeps legendaries)`,
  cooldown: 5_000,
  economy: true,
  async run({ prefix, args, user, server, db, reply, notHere }) {
    if (!user) return notHere();
    const usage = `Usage: \`${prefix}sell <item> [amount|all]\`, \`${prefix}sell <category>\` or \`${prefix}sell all\``;
    if (!args.length) return reply(usage);

    const owned = new Map(db.items(server.key, user.id).map((r) => [r.item, r.qty]));
    const finish = (lots, kept = '') => {
      const cents = lots.reduce((sum, l) => sum + l.item.price * l.qty, 0);
      const ok = db.sell(server.key, user.id, lots.map((l) => ({ item: l.item.id, qty: l.qty })), cents);
      if (!ok) return reply('Your Safety Deposit Box changed while I was counting. Try again.');
      const what = lots.length === 1 ? label(lots[0].item, lots[0].qty) : `${lots.reduce((n, l) => n + l.qty, 0)} items`;
      return reply(`💰 Sold ${what} for ${formatMoney(cents)}. You now have ${formatMoney(db.cents(server.key, user.id))}.${kept}`);
    };

    // Everything sellable, except legendaries: those go one name at a time.
    if (args.length === 1 && args[0].toLowerCase() === 'all') {
      const sellable = [...owned].map(([id, qty]) => ({ item: itemById.get(id), qty })).filter((l) => l.item && !l.item.retired);
      const lots = sellable.filter((l) => l.item.tier !== 'legendary');
      const kept = sellable.length > lots.length ? ` Legendaries stay in your box: sell those by name.` : '';
      if (!lots.length) return reply(`Nothing to sell.${kept}`);
      return finish(lots, kept);
    }

    // A whole category (tier) at once, legendary included since it's asked for by name.
    const tier = args.length === 1 && args[0].toLowerCase();
    if (TIERS.has(tier)) {
      const lots = [...owned].map(([id, qty]) => ({ item: itemById.get(id), qty })).filter((l) => l.item?.tier === tier && !l.item.retired);
      if (!lots.length) return reply(`You don't have any ${tier} items.`);
      return finish(lots);
    }

    // Working tools aren't in the box and can't be sold (broken ones can).
    const text = args.join(' ');
    const tool = !/^broken\b/i.test(text) && findTool(text);
    if (tool && db.tool(server.key, user.id, tool.kind)?.item === tool.id) return reply('Why would you wanna sell your own tools?');

    const last = args.at(-1).toLowerCase();
    const counted = args.length > 1 && (last === 'all' || /^\d+$/.test(last));
    const name = (counted ? args.slice(0, -1) : args).join(' ');
    const { item, matches } = findItem(name, owned);
    if (!item) {
      if (!matches.length) return reply(`There's no item called **${name}**.`);
      return reply(`Which one? ${matches.map((i) => `${i.emoji} ${i.name}`).join(', ')}`);
    }
    if (item.retired) return reply(`${item.emoji} **${item.name}** can't be sold.`);

    const have = owned.get(item.id) ?? 0;
    const qty = !counted ? 1 : last === 'all' ? have : Number(last);
    if (!have) return reply(`You don't have any ${item.emoji} **${item.name}**.`);
    if (qty < 1) return reply(usage);
    if (qty > have) return reply(`You only have ${label(item, have)}.`);
    return finish([{ item, qty }]);
  },
};
