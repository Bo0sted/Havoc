import { valueOf, formatMoney } from '../items.js';
import { propertyValue } from '../tools.js';

export default {
  name: 'gdp',
  category: 'economy',
  description: 'the whole server\'s worth: everyone\'s money, everything in their Backpacks and safes, and their property',
  cooldown: 30 * 60_000,
  economy: true,
  async run({ server, db, reply }) {
    const cash = db.totalCents(server.key);
    const goods = db.totalItems(server.key).reduce((sum, { item, qty }) => sum + valueOf(item, qty), 0);
    const property = db.allTools(server.key).reduce((sum, { item }) => sum + propertyValue(item), 0);
    return reply(`📈 **${server.name}**'s GDP is **${formatMoney(cash + goods + property)}** (${formatMoney(cash)} in cash, ${formatMoney(goods)} in Backpacks and safes, ${formatMoney(property)} in property)`);
  },
};
