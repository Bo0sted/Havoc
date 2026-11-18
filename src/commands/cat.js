import { pictureCommand } from '../pictures.js';

export default pictureCommand({
  name: 'cat',
  api: 'https://api.thecatapi.com/v1/images/search',
  pick: ([cat]) => cat.url,
  description: 'a random cat picture',
  cooldownText: (wait) => `🐱 The cats are resting, try again in ${wait}.`,
});
