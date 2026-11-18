// Havoc's storage: one SQLite file, every row keyed by server (its name,
// lowercased) and Haven user id, never by display name.
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS cooldown_overrides (
    server TEXT NOT NULL, command TEXT NOT NULL, ms INTEGER NOT NULL,
    PRIMARY KEY (server, command)
  );
  CREATE TABLE IF NOT EXISTS guest_blocks (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, until INTEGER NOT NULL,
    PRIMARY KEY (server, user_id)
  );
  CREATE TABLE IF NOT EXISTS wallets (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, cents INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (server, user_id)
  );
  CREATE TABLE IF NOT EXISTS items (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, item TEXT NOT NULL, qty INTEGER NOT NULL,
    PRIMARY KEY (server, user_id, item)
  );
`;

export function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  const q = (sql) => db.prepare(sql);

  const s = {
    overrides: q('SELECT command, ms FROM cooldown_overrides WHERE server = ?'),
    setOverride: q('INSERT INTO cooldown_overrides (server, command, ms) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET ms = excluded.ms'),
    clearOverride: q('DELETE FROM cooldown_overrides WHERE server = ? AND command = ?'),
    blockedUntil: q('SELECT until FROM guest_blocks WHERE server = ? AND user_id = ?'),
    block: q('INSERT INTO guest_blocks (server, user_id, until) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET until = excluded.until'),
    purgeBlocks: q('DELETE FROM guest_blocks WHERE until <= ?'),
    cents: q('SELECT cents FROM wallets WHERE server = ? AND user_id = ?'),
    items: q('SELECT item, qty FROM items WHERE server = ? AND user_id = ? AND qty > 0'),
    addItem: q('INSERT INTO items (server, user_id, item, qty) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET qty = qty + excluded.qty'),
  };

  return {
    overrides: (server) => new Map(s.overrides.all(server).map((r) => [r.command, r.ms])),
    setOverride: (server, command, ms) => s.setOverride.run(server, command, ms),
    // True when there was an override to remove.
    clearOverride: (server, command) => s.clearOverride.run(server, command).changes > 0,

    blockedUntil: (server, userId) => s.blockedUntil.get(server, userId)?.until ?? 0,
    blockGuest: (server, userId, until) => s.block.run(server, userId, until),
    purgeGuestBlocks: (now = Date.now()) => s.purgeBlocks.run(now),

    cents: (server, userId) => s.cents.get(server, userId)?.cents ?? 0,
    items: (server, userId) => s.items.all(server, userId),
    addItem: (server, userId, item, qty = 1) => s.addItem.run(server, userId, item, qty),

    close: () => db.close(),
  };
}
