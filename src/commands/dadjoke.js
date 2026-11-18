import { getJson } from '../web.js';

export default {
  name: 'dadjoke',
  category: 'fun',
  description: 'a random dad joke',
  cooldown: 5_000,
  rateLimit: { max: 30, per: 60_000 }, // no published limit: a courtesy cap
  cooldownText: (wait) => `🥁 Still groaning at the last one. Try again in ${wait}.`,
  async run({ reply }) {
    const { joke } = await getJson('https://icanhazdadjoke.com/');
    return reply(`🥁 ${joke}`);
  },
};
