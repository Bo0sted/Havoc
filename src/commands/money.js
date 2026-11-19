import { ITEMS, itemById, formatMoney } from '../items.js';
import { findTarget } from '../members.js';
import { KINDS, toolById, wear } from '../tools.js';
import { energyOf } from '../energy.js';
import { formatWait } from '../duration.js';

const order = new Map(ITEMS.map((item, i) => [item.id, i]));

export default {
  name: 'money',
  aliases: ['bank', 'balance', 'stats'],
  category: 'economy',
  usage: '[@user]',
  description: 'your money, energy and Safety Deposit Box, or someone else\'s',
  cooldown: 5_000,
  economy: true,
  async run({ prefix, args, user, server, db, commands, findMember, reply, notHere }) {
    let who = user;
    if (args.length) {
      const { query, member } = await findTarget(findMember, args);
      if (!member) return reply(`I can't find anyone called **${query}** here.`);
      who = member;
    }
    if (!who) return notHere();

    const box = db.items(server.key, who.id)
      .filter((row) => itemById.has(row.item))
      .sort((a, b) => order.get(a.item) - order.get(b.item))
      .map((row) => `${row.qty} ${itemById.get(row.item).emoji} ${itemById.get(row.item).name}`);

    // Tools in shop order (poles, then pickaxes), with how much they've been used.
    const kinds = Object.keys(KINDS);
    const tools = db.tools(server.key, who.id)
      .filter((t) => toolById.has(t.item))
      .sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind))
      .map((t) => `${KINDS[t.kind].emoji} ${toolById.get(t.item).name} (${wear(t.kind, t.uses)})`);

    const header = who === user ? '' : `🏦 **${who.name}**\n`;
    const toolLine = tools.length ? `\n${tools.join(' · ')}` : '';
    return reply(`${header}💵 ${formatMoney(db.cents(server.key, who.id))}\n${energyLine(prefix, commands, energyOf(db, server.key, who.id))}${toolLine}\nSafety Deposit Box: ${box.length ? box.join(', ') : 'empty'}`);
  },
};

// "⚡ Energy 47/60 (next in 23s) · +1 every 1m · ?fish 1 · ?mine 4 · recovery item in 34m"
function energyLine(prefix, commands, bar) {
  const costs = commands.filter((c) => c.energy).map((c) => `\`${prefix}${c.name}\` ${c.energy}`);
  const next = bar.next ? ` (next in ${formatWait(bar.next)})` : '';
  const boost = bar.boostIn ? ` · recovery item in ${formatWait(bar.boostIn)}` : '';
  return `⚡ Energy ${bar.points}/${bar.max}${next} · +1 every ${formatWait(bar.every)} · ${costs.join(' · ')}${boost}`;
}
