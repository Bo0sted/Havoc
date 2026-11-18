import { gatherCommand } from '../gather.js';

export default gatherCommand({
  name: 'fish',
  description: 'go fishing (needs a fishing pole from the shop); catches go in your Safety Deposit Box',
  kind: 'pole',
  from: 'fish',
  verb: 'caught',
  // How often each kind of catch comes up (weights, not percentages).
  tiers: [
    { tier: 'nothing', weight: 14 },
    { tier: 'trash', weight: 17 },
    { tier: 'common', weight: 48 },
    { tier: 'rare', weight: 13 },
    { tier: 'epic', weight: 6 },
    { tier: 'legendary', weight: 2 },
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
