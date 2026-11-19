import { gatherCommand } from '../gather.js';

export default gatherCommand({
  name: 'mine',
  description: 'go mining (needs a pickaxe from the shop; 4 energy); finds go in your Backpack',
  kind: 'pickaxe',
  from: 'mine',
  verb: 'mined',
  activity: 'Mining',
  // Hard work, big finds: 4 times fishing's energy and about 4 times its
  // payout (~$842 a swing), so both pay the same per energy. A big find
  // (epic+) is about 1 swing in 6.
  energy: 4,
  tiers: [
    { tier: 'nothing', weight: 10 },
    { tier: 'trash', weight: 20 },
    { tier: 'common', weight: 34 },
    { tier: 'rare', weight: 20 },
    { tier: 'epic', weight: 12 },
    { tier: 'legendary', weight: 4 },
  ],
  misses: [
    'You swung at nothing but air.',
    'Just dust. So much dust.',
    'A bat flew into your face. You got nothing.',
  ],
  noTool: [
    'You tried punching a rock and now you have a broken hand.',
    'You tried digging with a spoon. The spoon lost.',
    'You headbutted the cave wall. The cave wall won.',
    'You licked the rock. Still a rock.',
  ],
});
