import { HavenClient } from './haven.js';
import cat from './commands/cat.js';
import fish from './commands/fish.js';
import bet from './commands/bet.js';
import blowup from './commands/blowup.js';

const { HAVEN_URL, HAVOC_USERNAME, HAVOC_PASSWORD, PREFIX = 'h!' } = process.env;
if (!HAVEN_URL || !HAVOC_USERNAME || !HAVOC_PASSWORD) {
  console.error('Set HAVEN_URL, HAVOC_USERNAME and HAVOC_PASSWORD (see .env.example).');
  process.exit(1);
}
if (process.env.HAVEN_INSECURE_TLS === '1') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const commands = new Map();
for (const cmd of [cat, fish, bet, blowup]) {
  commands.set(cmd.name, cmd);
  for (const alias of cmd.aliases ?? []) commands.set(alias, cmd);
}

const help = {
  name: 'help',
  async run({ reply }) {
    const lines = [cat, fish, bet, blowup].map((c) => `\`${PREFIX}${c.name}\` ${c.description}`);
    return reply(`**Havoc commands**\n${lines.join('\n')}`);
  },
};
commands.set('help', help);

const haven = new HavenClient({ url: HAVEN_URL, username: HAVOC_USERNAME, password: HAVOC_PASSWORD });

haven.on('ready', (user) => console.log(`Havoc is online as ${user.displayName} (prefix ${PREFIX})`));
haven.on('warn', (msg) => console.warn(msg));
haven.on('error', (err) => console.error(err.message));

haven.on('message', async ({ channelCode, message }) => {
  const text = (message.content || '').trim();
  if (!text.toLowerCase().startsWith(PREFIX.toLowerCase())) return;
  const [name, ...args] = text.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = commands.get((name || '').toLowerCase());
  if (!cmd) return;

  const reply = (content) => haven.send(channelCode, content, { replyTo: message.id });
  const replyImage = (buffer, filename, mime) => haven.sendImage(channelCode, buffer, filename, mime, { replyTo: message.id });
  try {
    await cmd.run({ haven, channelCode, message, args, prefix: PREFIX, reply, replyImage });
  } catch (err) {
    console.error(`${PREFIX}${name} failed:`, err);
    reply('💥 Something went wrong (and not the fun kind of explosion).');
  }
});

// Keep trying until the server is up and the login works.
async function start() {
  for (;;) {
    try {
      return await haven.connect();
    } catch (err) {
      console.warn(`${err.message}. Retrying in 10s...`);
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}
start();
