import { ITEMS } from '../items.js';

// How often each kind of catch comes up (weights, not percentages).
const TIERS = [
  { tier: 'nothing', weight: 12 },
  { tier: 'trash', weight: 14 },
  { tier: 'common', weight: 44 },
  { tier: 'rare', weight: 18 },
  { tier: 'epic', weight: 9 },
  { tier: 'legendary', weight: 3 },
];
const TOTAL = TIERS.reduce((sum, t) => sum + t.weight, 0);

const MISSES = [
  'Your line snapped. The fish are laughing at you.',
  'You caught… absolutely nothing. Impressive.',
  'A seagull stole your bait.',
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function roll() {
  let n = Math.random() * TOTAL;
  const { tier } = TIERS.find((t) => (n -= t.weight) < 0) ?? TIERS[0];
  return tier === 'nothing' ? null : pick(ITEMS.filter((i) => i.tier === tier && !i.retired));
}

export default {
  name: 'fish',
  category: 'economy',
  description: 'go fishing; catches go in your Safety Deposit Box',
  cooldown: 20_000,
  economy: true,
  cooldownText: (wait) => `🎣 You're still untangling your line. Try again in ${wait}.`,
  async run({ user, server, db, reply, notHere }) {
    if (!user) return notHere();
    const item = roll();
    if (!item) return reply(`🎣 ${pick(MISSES)}`);

    db.addItem(server.key, user.id, item.id);
    const shout = item.tier === 'legendary' ? ' **WHAT?!**' : item.tier === 'epic' ? ' Nice!' : '';
    return reply(`🎣 **${user.name}** caught ${item.emoji} **${item.name}** (${item.tier})!${shout} It's in your Safety Deposit Box.`);
  },
};
