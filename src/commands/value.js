import { formatMoney } from '../items.js';
import { findItem } from '../storage.js';
import { rarity } from '../colors.js';

// Where each kind of item comes from.
const FROM = { fish: 'fishing', mine: 'mining', hunt_small: 'small-game hunting', hunt_big: 'big-game hunting' };
const capital = (text) => text[0].toUpperCase() + text.slice(1);

export default {
  name: 'value',
  category: 'economy',
  usage: '<item>',
  description: "an item's rarity and what it sells for",
  cooldown: 5_000,
  async run({ prefix, args, user, server, db, reply }) {
    if (!args.length) return reply(`Usage: \`${prefix}value <item>\``);
    const held = user ? new Map(db.items(server.key, user.id).map((r) => [r.item, r.qty])) : undefined;
    const name = args.join(' ');
    const { item, matches } = findItem(name, held);
    if (!item) {
      if (!matches.length) return reply(`There's no item called **${name}**.`);
      return reply(`Which one? ${matches.map((i) => `${i.emoji} ${i.name}`).join(', ')}`);
    }
    const tier = rarity(item.tier, capital(item.tier));
    const source = FROM[item.from] ? ` · from ${FROM[item.from]}` : '';
    if (item.retired) return reply(`${item.emoji} **${item.name}** · ${tier} · retired: it can't be sold or caught any more`);
    return reply(`${item.emoji} **${item.name}** · ${tier}${source} · sells for **${formatMoney(item.price)}**`);
  },
};
