// First, so ?console sees everything printed from here on.
import './console.js';
import { HavenClient } from './haven.js';
import { loadServers } from './config.js';
import { openDb } from './db.js';
import { createCooldowns } from './cooldowns.js';
import { createRouter } from './router.js';
import commands from './commands/index.js';

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
const cooldowns = createCooldowns(db);
const router = createRouter({ prefix: PREFIX, commands, servers, db, cooldowns });

// Expired guest blocks and stale cooldowns are cleared out hourly.
setInterval(() => {
  db.purgeGuestBlocks();
  cooldowns.prune();
}, 3_600_000).unref();

for (const server of servers) {
  const log = (fn) => (msg) => fn(`[${server.name}] ${msg}`);
  server.client = new HavenClient(server);
  server.client.on('ready', (user) => console.log(`[${server.name}] online as ${user.displayName} (prefix ${PREFIX})`));
  server.client.on('warn', log(console.warn));
  server.client.on('error', (err) => console.error(`[${server.name}] ${err.message}`));
  server.client.on('message', (event) => router.handle(server, event));
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
