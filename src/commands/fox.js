import { pictureCommand } from '../pictures.js';

export default pictureCommand({
  name: 'fox',
  api: 'https://randomfox.ca/floof/',
  pick: (fox) => fox.image,
  description: 'a random fox picture',
  cooldownText: (wait) => `🦊 The foxes are hiding, try again in ${wait}.`,
});
