import { gatherCommand } from '../gather.js';

export default gatherCommand({
  name: 'mine',
  description: 'go mining (needs a pickaxe from the shop); finds go in your Safety Deposit Box',
  kind: 'pickaxe',
  from: 'mine',
  verb: 'mined',
  // Stingier than fishing: a big find (epic+) is about 1 swing in 20.
  tiers: [
    { tier: 'nothing', weight: 10 },
    { tier: 'trash', weight: 25 },
    { tier: 'common', weight: 45 },
    { tier: 'rare', weight: 15 },
    { tier: 'epic', weight: 4 },
    { tier: 'legendary', weight: 1 },
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
