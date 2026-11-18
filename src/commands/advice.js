import { getJson } from '../web.js';

export default {
  name: 'advice',
  category: 'fun',
  description: 'a random piece of advice',
  cooldown: 5_000,
  // The API repeats the same advice for 2 seconds after each request.
  rateLimit: { max: 1, per: 2_000 },
  cooldownText: (wait) => `🦉 Still thinking that one over. Try again in ${wait}.`,
  async run({ reply }) {
    const { slip } = await getJson('https://api.adviceslip.com/advice');
    return reply(`🦉 ${slip.advice}`);
  },
};
