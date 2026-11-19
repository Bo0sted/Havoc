import { formatMoney } from '../items.js';
import { findTool } from '../tools.js';
import { TIERS, choose, describe } from '../storage.js';

export default {
  name: 'sell',
  category: 'economy',
  usage: ['<item> [amount|all]', '<category>', 'all'],
  description: `sell from your Backpack; categories: ${[...TIERS].join(', ')} (selling all keeps legendaries)`,
  cooldown: 5_000,
  economy: true,
  async run({ prefix, args, user, server, db, reply, notHere }) {
    if (!user) return notHere();
    return sellFrom('backpack', args, { prefix, user, server, db, reply });
  },
};

// ?sell (the Backpack) and ?safe sell (the safe) work the same way.
export function sellFrom(place, args, { prefix, user, server, db, reply }) {
  const command = place === 'safe' ? 'safe sell' : 'sell';
  const where = place === 'safe' ? ' in your safe' : '';
  const box = place === 'safe' ? 'safe' : 'Backpack';
  const usage = `Usage: \`${prefix}${command} <item> [amount|all]\`, \`${prefix}${command} <category>\` or \`${prefix}${command} all\``;
  if (!args.length) return reply(usage);

  // Working tools aren't in the Backpack and can't be sold (broken ones can).
  const text = args.join(' ');
  const tool = !/^broken\b/i.test(text) && findTool(text);
  if (tool && db.tool(server.key, user.id, tool.kind)?.item === tool.id) return reply('Why would you wanna sell your own tools?');

  const { lots, error, usage: badAmount, keptLegendaries } = choose(args, db.items(server.key, user.id, place), { allKeepsLegendaries: true, where, verb: 'sold' });
  if (badAmount) return reply(usage);
  if (error) return reply(error);
  const kept = keptLegendaries ? ` Legendaries stay in your ${box}: sell those by name.` : '';
  if (!lots.length) return reply(`Nothing to sell.${kept}`);

  const cents = lots.reduce((sum, l) => sum + l.item.price * l.qty, 0);
  const ok = db.sell(server.key, user.id, lots.map((l) => ({ item: l.item.id, qty: l.qty })), cents, place);
  if (!ok) return reply(`Your ${box} changed while I was counting. Try again.`);
  return reply(`💰 Sold ${describe(lots)} for ${formatMoney(cents)}. You now have ${formatMoney(db.cents(server.key, user.id))}.${kept}`);
}
