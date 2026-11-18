import { pictureCommand } from '../pictures.js';

export default pictureCommand({
  name: 'duck',
  api: 'https://random-d.uk/api/v2/random',
  pick: (duck) => duck.url,
  description: 'a random duck picture',
  cooldownText: (wait) => `🦆 The ducks flew off, try again in ${wait}.`,
});
