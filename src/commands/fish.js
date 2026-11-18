import { cooldown } from '../cooldown.js';

const onCooldown = cooldown(20_000);

// weight = how often that tier comes up
const TIERS = [
  { tier: 'nothing', weight: 18, catches: [
    'Your line snapped. The fish are laughing at you.',
    'You caught… absolutely nothing. Impressive.',
    'A seagull stole your bait.',
  ] },
  { tier: 'trash', emoji: '🗑️', weight: 16, catches: ['Old Boot', 'Soggy Sock', 'Tin Can', 'Seaweed', 'Someone\'s Car Keys'] },
  { tier: 'common', emoji: '🐟', weight: 34, catches: ['Common Fish', 'Sardine', 'Anchovy', 'Minnow'] },
  { tier: 'uncommon', emoji: '🐠', weight: 18, catches: ['Tropical Fish', 'Clownfish', 'Trout', 'Salmon'] },
  { tier: 'rare', emoji: '🐡', weight: 9, catches: ['Pufferfish', 'Swordfish', 'Octopus', 'Squid'] },
  { tier: 'epic', emoji: '🦈', weight: 4, catches: ['Shark', 'Giant Squid', 'Electric Eel'] },
  { tier: 'legendary', emoji: '🐉', weight: 1, catches: ['Kraken', 'Golden Fish', 'Leviathan', 'Literally a Dragon'] },
];
const TOTAL = TIERS.reduce((sum, t) => sum + t.weight, 0);

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function roll() {
  let n = Math.random() * TOTAL;
  for (const t of TIERS) if ((n -= t.weight) < 0) return t;
  return TIERS[0];
}

export default {
  name: 'fish',
  description: 'go fishing',
  async run({ message, reply }) {
    const wait = onCooldown(message.user_id);
    if (wait) return reply(`🎣 You're still untangling your line. Try again in ${wait}s.`);

    const t = roll();
    if (t.tier === 'nothing') return reply(`🎣 ${pick(t.catches)}`);
    const name = pick(t.catches);
    const shout = t.tier === 'legendary' ? ' **WHAT?!**' : t.tier === 'epic' ? ' Nice!' : '';
    return reply(`🎣 **${message.username}** cast their line and caught ${t.emoji} **${name}** (${t.tier})!${shout}`);
  },
};
