import { valueOf, formatMoney } from '../items.js';

export default {
  name: 'gdp',
  category: 'economy',
  description: 'the whole server\'s worth: everyone\'s money plus everything in their Backpacks and safes',
  cooldown: 30 * 60_000,
  economy: true,
  async run({ server, db, reply }) {
    const cash = db.totalCents(server.key);
    const goods = db.totalItems(server.key).reduce((sum, { item, qty }) => sum + valueOf(item, qty), 0);
    return reply(`📈 **${server.name}**'s GDP is **${formatMoney(cash + goods)}** (${formatMoney(cash)} in cash, ${formatMoney(goods)} in Backpacks and safes)`);
  },
};
