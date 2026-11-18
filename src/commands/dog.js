import { pictureCommand } from '../pictures.js';

export default pictureCommand({
  name: 'dog',
  api: 'https://dog.ceo/api/breeds/image/random',
  pick: (dog) => dog.message,
  description: 'a random dog picture',
  cooldownText: (wait) => `🐶 The dogs are napping, try again in ${wait}.`,
});
