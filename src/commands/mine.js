import { gatherCommand } from '../gather.js';

export default gatherCommand({
  name: 'mine',
  description: 'go mining (needs a pickaxe from the shop; 2 energy, some risk of the hospital); finds go in your Backpack',
  kind: 'pickaxe',
  from: 'mine',
  stream: 'mining',
  verb: 'mined',
  activity: 'Mining',
  // Harder work, bigger finds: twice fishing's energy for ~$494 a swing, a
  // little more per energy, and riskier (about 1 swing in 67 ends in the
  // hospital). Out of 1,000, like fishing.
  energy: 2,
  tiers: [
    { tier: 'hospital', weight: 15 },
    { tier: 'nothing', weight: 35 },
    { tier: 'trash', weight: 140 },
    { tier: 'common', weight: 435 },
    { tier: 'rare', weight: 280 },
    { tier: 'epic', weight: 75 },
    { tier: 'legendary', weight: 20 },
  ],
  misses: [
    'You swung at nothing but air.',
    'Just dust. So much dust.',
    'A bat flew into your face. You got nothing.',
  ],
  hurt: [
    'You missed the rock and hit your own foot.',
    'The tunnel caved in. Just a little. Mostly on you.',
    'You hit a gas pocket and woke up in an ambulance.',
    'Your pickaxe bounced off the rock and came back for you.',
  ],
  noTool: [
    'You tried punching a rock and now you have a broken hand.',
    'You tried digging with a spoon. The spoon lost.',
    'You headbutted the cave wall. The cave wall won.',
    'You licked the rock. Still a rock.',
  ],
});
