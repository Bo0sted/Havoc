import { ITEMS, itemById, formatMoney } from '../items.js';
import { findTarget } from '../members.js';

const order = new Map(ITEMS.map((item, i) => [item.id, i]));

export default {
  name: 'money',
  aliases: ['bank'],
  description: 'your money and Safety Deposit Box (or someone else\'s: money @user)',
  cooldown: 5_000,
  economy: true,
  async run({ args, user, server, db, findMember, reply, notHere }) {
    let who = user;
    if (args.length) {
      const { query, member } = await findTarget(findMember, args);
      if (!member) return reply(`🤷 I can't find anyone called **${query}** here.`);
      who = member;
    }
    if (!who) return notHere();

    const box = db.items(server.key, who.id)
      .filter((row) => itemById.has(row.item))
      .sort((a, b) => order.get(a.item) - order.get(b.item))
      .map((row) => `${row.qty} ${itemById.get(row.item).emoji} ${itemById.get(row.item).name}`);

    const header = who === user ? '' : `🏦 **${who.name}**\n`;
    return reply(`${header}💵 ${formatMoney(db.cents(server.key, who.id))}\nSafety Deposit Box: ${box.length ? box.join(', ') : 'empty'}`);
  },
};
