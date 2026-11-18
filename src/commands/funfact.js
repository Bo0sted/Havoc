import { getJson } from '../web.js';

// Random facts from uselessfacts.jsph.pl (free, no key needed).
const API = 'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en';

export default {
  name: 'funfact',
  category: 'fun',
  description: 'a random fun fact',
  cooldown: 10_000,
  rateLimit: { max: 30, per: 60_000 }, // no published limit: a courtesy cap
  cooldownText: (wait) => `🧠 Still thinking of a good one. Try again in ${wait}.`,
  async run({ reply }) {
    const { text } = await getJson(API);
    // The source text has stray spaces and doubled full stops.
    return reply(`🧠 ${String(text).trim().replace(/\s+/g, ' ').replace(/\.{2,}$/, '.')}`);
  },
};
