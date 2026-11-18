import { itemById, formatMoney } from '../items.js';

export default {
  name: 'gdp',
  category: 'economy',
  description: 'the whole server\'s worth: everyone\'s money plus everything in their boxes',
  cooldown: 30 * 60_000,
  economy: true,
  async run({ server, db, reply }) {
    const cash = db.totalCents(server.key);
    // Items count at their sell price; retired ones can't be sold, so they're worth nothing.
    const goods = db.totalItems(server.key).reduce((sum, { item, qty }) => {
      const it = itemById.get(item);
      return it && !it.retired ? sum + it.price * qty : sum;
    }, 0);
    return reply(`📈 **${server.name}**'s GDP is **${formatMoney(cash + goods)}** (${formatMoney(cash)} in cash, ${formatMoney(goods)} in Safety Deposit Boxes)`);
  },
};
