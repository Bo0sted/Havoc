// First, so ?console sees everything printed from here on.
import './console.js';
import { HavenClient } from './haven.js';
import { loadServers } from './config.js';
import { openDb } from './db.js';
import { valueOf } from './items.js';
import { createCooldowns } from './cooldowns.js';
import { createRouter } from './router.js';
import commands from './commands/index.js';
import { warmUp } from './wheel-gif.js';
import { createReminders, SNOOZE_WINDOW } from './reminders.js';

const PREFIX = process.env.PREFIX || 'h!';
const DB_PATH = process.env.DB_PATH || new URL('../havoc.db', import.meta.url).pathname;
if (process.env.HAVEN_INSECURE_TLS === '1') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Nothing that goes wrong is allowed to take the bot down or reach chat.
process.on('unhandledRejection', (err) => console.error('Unhandled error:', err));
process.on('uncaughtException', (err) => console.error('Uncaught error:', err));

let servers;
try {
  servers = loadServers();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
if (!servers.length) {
  console.error('No usable servers in SERVERS, so there is nothing to connect to. Stopping.');
  process.exit(1);
}

const db = openDb(DB_PATH);
// Once: everyone already here starts their earnings at their net worth.
db.seedEarnings(valueOf);
const cooldowns = createCooldowns(db);
const reminders = createReminders({ db, servers, prefix: PREFIX });
const router = createRouter({ prefix: PREFIX, commands, servers, db, cooldowns, reminders });

// Draws any wheel GIFs that aren't drawn yet, in the background (once; they're kept).
warmUp().catch((err) => console.error('[wheel] Warm-up failed:', err));

// Expired guest blocks, jail terms, stale cooldowns and reminders too old to
// snooze are cleared out hourly.
setInterval(() => {
  db.purgeGuestBlocks();
  db.purgeJail();
  db.purgeReminders(Date.now() - SNOOZE_WINDOW);
  cooldowns.prune();
}, 3_600_000).unref();

for (const server of servers) {
  const log = (fn) => (msg) => fn(`[${server.name}] ${msg}`);
  server.client = new HavenClient(server, db.keyStore(server.key));
  server.client.on('ready', (user) => console.log(`[${server.name}] online as ${user.displayName} (prefix ${PREFIX})`));
  server.client.on('warn', log(console.warn));
  server.client.on('error', (err) => console.error(`[${server.name}] ${err.message}`));
  server.client.on('message', (event) => router.handle(server, event));
  // Reminders that came due while this server was out of reach go off once
  // its channels are known again.
  server.client.on('channels', () => reminders.run());
  server.client.on('reactions', (event) => reminders.reacted(server, event).catch((err) => console.error(`[${server.name}] Snoozing by reaction failed:`, err)));
  connect(server);
}

// Each server keeps trying on its own until it's up and the login works.
async function connect(server) {
  for (;;) {
    try {
      return await server.client.connect();
    } catch (err) {
      // fetch's own message is just "fetch failed"; the cause says why.
      const why = err.cause ? ` (${err.cause.code ?? ''} ${err.cause.message ?? ''})`.replace('( ', '(') : '';
      console.warn(`[${server.name}] ${err.message}${why}. Retrying in 10s...`);
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    db.close();
    process.exit(0);
  });
}
