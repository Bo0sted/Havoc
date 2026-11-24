import { gatherCommand } from '../gather.js';

export default gatherCommand({
  name: 'fish',
  description: 'go fishing (needs a fishing pole from the shop; 1 energy, the least risk of the hospital); catches go in your Backpack',
  kind: 'pole',
  from: 'fish',
  stream: 'fishing',
  verb: 'caught',
  activity: 'Fishing',
  // Little work, small catches, little danger: ~$216 a cast, the least per
  // energy of any job, and 1 cast in 200 ends in the hospital.
  energy: 1,
  // How often each kind of catch comes up, out of 1,000. Misses are rare
  // (owner's call: catching something common feels better).
  tiers: [
    { tier: 'hospital', weight: 5 },
    { tier: 'nothing', weight: 45 },
    { tier: 'trash', weight: 150 },
    { tier: 'common', weight: 630 },
    { tier: 'rare', weight: 130 },
    { tier: 'epic', weight: 30 },
    { tier: 'legendary', weight: 10 },
  ],
  misses: [
    'Your line snapped. The fish are laughing at you.',
    'You caught… absolutely nothing. Impressive.',
    'A seagull stole your bait.',
  ],
  hurt: [
    'You slipped on the wet deck and cracked your head on the cooler.',
    'You were cleaning your catch and filleted your thumb instead.',
    'You tripped over the anchor line and broke your wrist.',
  ],
  noTool: [
    'You tried fishing with your bare hands and a piranha bit you.',
    'You tried fishing with your hands and fell into the water.',
    'You tried grabbing a fish with your hands. It slapped you and swam away.',
    'You threw a rock at the water and hoped. Nothing happened.',
  ],
  cooldownText: (wait) => `🎣 You're still untangling your line. Try again in ${wait}.`,
});
