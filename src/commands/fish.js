import { gatherCommand } from '../gather.js';

export default gatherCommand({
  name: 'fish',
  description: 'go fishing (needs a fishing pole from the shop; 1 energy); catches go in your Backpack',
  kind: 'pole',
  from: 'fish',
  stream: 'fishing',
  verb: 'caught',
  activity: 'Fishing',
  // Little work, small catches: a quarter of mining's energy and about a
  // quarter of its payout (~$212 a cast), so both pay the same per energy.
  energy: 1,
  // How often each kind of catch comes up (weights, not percentages). Misses
  // are rare (owner's call: catching something common feels better).
  tiers: [
    { tier: 'nothing', weight: 5 },
    { tier: 'trash', weight: 18 },
    { tier: 'common', weight: 63 },
    { tier: 'rare', weight: 10 },
    { tier: 'epic', weight: 3 },
    { tier: 'legendary', weight: 1 },
  ],
  misses: [
    'Your line snapped. The fish are laughing at you.',
    'You caught… absolutely nothing. Impressive.',
    'A seagull stole your bait.',
  ],
  noTool: [
    'You tried fishing with your bare hands and a piranha bit you.',
    'You tried fishing with your hands and fell into the water.',
    'You tried grabbing a fish with your hands. It slapped you and swam away.',
    'You threw a rock at the water and hoped. Nothing happened.',
  ],
  cooldownText: (wait) => `🎣 You're still untangling your line. Try again in ${wait}.`,
});
