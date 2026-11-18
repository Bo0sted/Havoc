import { recentLines, MAX_LINES } from '../console.js';
import { chunks } from '../chunks.js';

const SHORT = 10;
// Room for the code fences and the remote note in each message.
const PIECE = 1700;

export default {
  name: 'console',
  usage: ['', 'all'],
  description: `show the last ${SHORT} console lines, or the last ${MAX_LINES} with all`,
  admin: true,
  async run({ args, reply }) {
    const all = args[0]?.toLowerCase() === 'all';
    const lines = recentLines(all ? MAX_LINES : SHORT);
    if (!lines.length) return reply('The console is empty.');
    // A ``` inside a line would end the code block early.
    const text = lines.map((l) => l.replaceAll('```', "'''")).join('\n');
    for (const piece of chunks(text, PIECE)) await reply(`\`\`\`\n${piece}\n\`\`\``);
  },
};
