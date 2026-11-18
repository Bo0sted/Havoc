import { everywhere } from '../everywhere.js';

// Haven's own limit; a longer status is quietly cleared instead of refused.
// Counted like Haven counts it, so an emoji is usually 2.
const MAX_LENGTH = 128;

export default {
  name: 'status',
  usage: ['<text>', 'clear'],
  description: "set Havoc's status on every server, or clear it",
  admin: true,
  async run({ prefix, args, servers, reply, replyEditable }) {
    if (!args.length) return reply(`Usage: \`${prefix}status <text>\` or \`${prefix}status clear\``);
    const clear = args.length === 1 && args[0].toLowerCase() === 'clear';
    const text = clear ? '' : args.join(' ');
    if (text.length > MAX_LENGTH) return reply(`That status is ${text.length} characters; Haven allows ${MAX_LENGTH}.`);
    return everywhere({ servers, replyEditable },
      clear ? { emoji: '💬', doing: 'Clearing the status', done: 'Cleared the status' }
        : { emoji: '💬', doing: 'Setting the status', done: 'Updated the status' },
      (server) => server.client.setStatus(text));
  },
};
