// Random facts from uselessfacts.jsph.pl (free, no key needed).
const API = 'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en';

export default {
  name: 'funfact',
  category: 'fun',
  description: 'a random fun fact',
  cooldown: 10_000,
  cooldownText: (wait) => `🧠 Still thinking of a good one. Try again in ${wait}.`,
  async run({ reply }) {
    const res = await fetch(API, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`fun fact API answered ${res.status}`);
    const { text } = await res.json();
    // The source text has stray spaces and doubled full stops.
    return reply(`🧠 ${String(text).trim().replace(/\s+/g, ' ').replace(/\.{2,}$/, '.')}`);
  },
};
