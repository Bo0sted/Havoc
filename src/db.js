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
  CREATE TABLE IF NOT EXISTS bot_channels (
    server TEXT NOT NULL, channel_id INTEGER NOT NULL,
    PRIMARY KEY (server, channel_id)
  );
  CREATE TABLE IF NOT EXISTS dailies (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, last INTEGER NOT NULL, streak INTEGER NOT NULL,
    PRIMARY KEY (server, user_id)
  );
  CREATE TABLE IF NOT EXISTS lottery_streaks (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, streak INTEGER NOT NULL,
    PRIMARY KEY (server, user_id)
  );
  CREATE TABLE IF NOT EXISTS pending_bets (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, cents INTEGER NOT NULL,
    PRIMARY KEY (server, user_id)
  );
  CREATE TABLE IF NOT EXISTS bet_stats (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, game TEXT NOT NULL,
    bets INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0,
    ties INTEGER NOT NULL DEFAULT 0, timeouts INTEGER NOT NULL DEFAULT 0,
    wagered INTEGER NOT NULL DEFAULT 0, won INTEGER NOT NULL DEFAULT 0, lost INTEGER NOT NULL DEFAULT 0,
    penalties INTEGER NOT NULL DEFAULT 0, biggest_win INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (server, user_id, game)
  );
  CREATE TABLE IF NOT EXISTS tools (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, kind TEXT NOT NULL, item TEXT NOT NULL, uses INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (server, user_id, kind)
  );
  CREATE TABLE IF NOT EXISTS promo_claims (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, promo TEXT NOT NULL,
    PRIMARY KEY (server, user_id, promo)
  );
  CREATE TABLE IF NOT EXISTS items (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, item TEXT NOT NULL, qty INTEGER NOT NULL,
    PRIMARY KEY (server, user_id, item)
  );
  CREATE TABLE IF NOT EXISTS energy (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, points INTEGER NOT NULL, since INTEGER NOT NULL,
    boosted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (server, user_id)
  );
  CREATE TABLE IF NOT EXISTS energy_settings (
    server TEXT NOT NULL PRIMARY KEY, max INTEGER NOT NULL, every INTEGER NOT NULL
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
    botChannels: q('SELECT channel_id FROM bot_channels WHERE server = ? ORDER BY rowid'),
    addBotChannel: q('INSERT OR IGNORE INTO bot_channels (server, channel_id) VALUES (?, ?)'),
    removeBotChannel: q('DELETE FROM bot_channels WHERE server = ? AND channel_id = ?'),
    totalCents: q('SELECT COALESCE(SUM(cents), 0) AS cents FROM wallets WHERE server = ?'),
    totalItems: q('SELECT item, SUM(qty) AS qty FROM items WHERE server = ? AND qty > 0 GROUP BY item'),
    wallets: q('SELECT user_id, cents FROM wallets WHERE server = ?'),
    allItems: q('SELECT user_id, item, qty FROM items WHERE server = ? AND qty > 0'),
    daily: q('SELECT last, streak FROM dailies WHERE server = ? AND user_id = ?'),
    setDaily: q('INSERT INTO dailies (server, user_id, last, streak) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET last = excluded.last, streak = excluded.streak'),
    lotteryStreak: q('SELECT streak FROM lottery_streaks WHERE server = ? AND user_id = ?'),
    setLotteryStreak: q('INSERT INTO lottery_streaks (server, user_id, streak) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET streak = excluded.streak'),
    takeCents: q('UPDATE wallets SET cents = cents - ? WHERE server = ? AND user_id = ? AND cents >= ?'),
    holdBet: q('INSERT INTO pending_bets (server, user_id, cents) VALUES (?, ?, ?)'),
    dropBet: q('DELETE FROM pending_bets WHERE server = ? AND user_id = ?'),
    pendingBets: q('SELECT server, user_id, cents FROM pending_bets'),
    recordBet: q(`INSERT INTO bet_stats (server, user_id, game, bets, wins, losses, ties, timeouts, wagered, won, lost, penalties, biggest_win)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO UPDATE SET bets = bets + 1, wins = wins + excluded.wins, losses = losses + excluded.losses,
        ties = ties + excluded.ties, timeouts = timeouts + excluded.timeouts, wagered = wagered + excluded.wagered,
        won = won + excluded.won, lost = lost + excluded.lost, penalties = penalties + excluded.penalties,
        biggest_win = MAX(biggest_win, excluded.biggest_win)`),
    betStats: q('SELECT * FROM bet_stats WHERE server = ? AND user_id = ?'),
    tool: q('SELECT item, uses FROM tools WHERE server = ? AND user_id = ? AND kind = ?'),
    tools: q('SELECT kind, item, uses FROM tools WHERE server = ? AND user_id = ?'),
    setTool: q('INSERT INTO tools (server, user_id, kind, item, uses) VALUES (?, ?, ?, ?, 0) ON CONFLICT DO UPDATE SET item = excluded.item, uses = 0'),
    useTool: q('UPDATE tools SET uses = uses + 1 WHERE server = ? AND user_id = ? AND kind = ?'),
    dropTool: q('DELETE FROM tools WHERE server = ? AND user_id = ? AND kind = ?'),
    claimPromo: q('INSERT OR IGNORE INTO promo_claims (server, user_id, promo) VALUES (?, ?, ?)'),
    promoClaimed: q('SELECT 1 FROM promo_claims WHERE server = ? AND user_id = ? AND promo = ?'),
    takeItem: q('UPDATE items SET qty = qty - ? WHERE server = ? AND user_id = ? AND item = ? AND qty >= ?'),
    addCents: q('INSERT INTO wallets (server, user_id, cents) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET cents = cents + excluded.cents'),
    energy: q('SELECT points, since, boosted FROM energy WHERE server = ? AND user_id = ?'),
    setEnergy: q('INSERT INTO energy (server, user_id, points, since) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET points = excluded.points, since = excluded.since'),
    boost: q('INSERT INTO energy (server, user_id, points, since, boosted) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET points = excluded.points, since = excluded.since, boosted = excluded.boosted'),
    energySettings: q('SELECT max, every FROM energy_settings WHERE server = ?'),
    setEnergySettings: q('INSERT INTO energy_settings (server, max, every) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET max = excluded.max, every = excluded.every'),
    clearEnergySettings: q('DELETE FROM energy_settings WHERE server = ?'),
  };

  // Runs fn inside one transaction: everything in it lands, or nothing does
  // (when it throws or returns false).
  function atomic(fn) {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec(result === false ? 'ROLLBACK' : 'COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  // Bets still held when Havoc last stopped never finished: hand them back.
  atomic(() => {
    for (const bet of s.pendingBets.all()) {
      s.addCents.run(bet.server, bet.user_id, bet.cents);
      s.dropBet.run(bet.server, bet.user_id);
    }
  });

  return {
    overrides: (server) => new Map(s.overrides.all(server).map((r) => [r.command, r.ms])),
    setOverride: (server, command, ms) => s.setOverride.run(server, command, ms),
    // True when there was an override to remove.
    clearOverride: (server, command) => s.clearOverride.run(server, command).changes > 0,

    blockedUntil: (server, userId) => s.blockedUntil.get(server, userId)?.until ?? 0,
    blockGuest: (server, userId, until) => s.block.run(server, userId, until),
    purgeGuestBlocks: (now = Date.now()) => s.purgeBlocks.run(now),

    botChannels: (server) => s.botChannels.all(server).map((r) => r.channel_id),
    // Adds the channel, or removes it if it was already there. True when added.
    toggleBotChannel: (server, channelId) =>
      s.removeBotChannel.run(server, channelId).changes === 0 && s.addBotChannel.run(server, channelId).changes > 0,

    cents: (server, userId) => s.cents.get(server, userId)?.cents ?? 0,
    items: (server, userId) => s.items.all(server, userId),
    // Everyone's money, and every item held, on one server.
    totalCents: (server) => s.totalCents.get(server).cents,
    totalItems: (server) => s.totalItems.all(server),
    // A bet's wager leaves the wallet and is recorded until settleBet pays
    // out (the whole wager, part of it, or nothing). False if they can't
    // afford it.
    holdBet: (server, userId, cents) => atomic(() => {
      if (s.takeCents.run(cents, server, userId, cents).changes === 0) return false;
      s.holdBet.run(server, userId, cents);
      return true;
    }),
    // `outcome` (game, result, wager) goes into their betting record in the
    // same transaction as the payout.
    settleBet: (server, userId, payout, outcome) => atomic(() => {
      s.dropBet.run(server, userId);
      if (payout > 0) s.addCents.run(server, userId, payout);
      if (!outcome) return; // a refund, not a finished bet
      const { game, result, wager } = outcome;
      const profit = Math.max(0, payout - wager);
      const loss = Math.max(0, wager - payout);
      s.recordBet.run(server, userId, game, +(result === 'win'), +(result === 'lose'), +(result === 'tie'), +(result === 'timeout'),
        wager, profit, loss, result === 'timeout' ? loss : 0, profit);
    }),
    // Their betting record, one row per game.
    betStats: (server, userId) => s.betStats.all(server, userId),
    // Tools (one per kind: 'pole', 'pickaxe'), as { item, uses } or null.
    tool: (server, userId, kind) => s.tool.get(server, userId, kind) ?? null,
    tools: (server, userId) => s.tools.all(server, userId),
    useTool: (server, userId, kind) => s.useTool.run(server, userId, kind),
    // The tool turns into its broken item in the Safety Deposit Box.
    breakTool: (server, userId, kind, brokenItem) => atomic(() => {
      s.dropTool.run(server, userId, kind);
      s.addItem.run(server, userId, brokenItem, 1);
    }),
    // Pays `cost` and puts a fresh tool in that slot (replacing the old one,
    // which was traded in). False, and nothing changes, if they can't afford it.
    buyTool: (server, userId, kind, item, cost) => atomic(() => {
      if (cost > 0 && s.takeCents.run(cost, server, userId, cost).changes === 0) return false;
      s.setTool.run(server, userId, kind, item);
      return true;
    }),
    promoClaimed: (server, userId, promo) => !!s.promoClaimed.get(server, userId, promo),
    // A promo is claimed once: as the tool itself, or as cash instead.
    // False if it was already claimed.
    claimPromoTool: (server, userId, promo, kind, item) => atomic(() => {
      if (s.claimPromo.run(server, userId, promo).changes === 0) return false;
      s.setTool.run(server, userId, kind, item);
      return true;
    }),
    claimPromoCash: (server, userId, promo, cents) => atomic(() => {
      if (s.claimPromo.run(server, userId, promo).changes === 0) return false;
      s.addCents.run(server, userId, cents);
      return true;
    }),
    addCents: (server, userId, cents) => s.addCents.run(server, userId, cents),
    // Takes up to `cents`, never below $0 (nobody goes into debt). Returns
    // how much was actually taken.
    takeUpTo: (server, userId, cents) => atomic(() => {
      const taken = Math.min(cents, s.cents.get(server, userId)?.cents ?? 0);
      if (taken > 0) s.takeCents.run(taken, server, userId, taken);
      return taken;
    }),
    // Every wallet and every held item on one server, for rankings.
    wallets: (server) => s.wallets.all(server),
    allItems: (server) => s.allItems.all(server),
    // The last daily claim ({ last, streak }), or null if never claimed.
    daily: (server, userId) => s.daily.get(server, userId) ?? null,
    claimDaily: (server, userId, at, streak, cents) => atomic(() => {
      s.setDaily.run(server, userId, at, streak);
      s.addCents.run(server, userId, cents);
    }),
    // Wins in a row at ?lottery; a win pays and extends it, a loss ends it.
    lotteryStreak: (server, userId) => s.lotteryStreak.get(server, userId)?.streak ?? 0,
    lotteryWin: (server, userId, streak, cents) => atomic(() => {
      s.setLotteryStreak.run(server, userId, streak);
      s.addCents.run(server, userId, cents);
    }),
    lotteryLoss: (server, userId) => s.setLotteryStreak.run(server, userId, 0),
    addItem: (server, userId, item, qty = 1) => s.addItem.run(server, userId, item, qty),
    // Energy for ?fish and ?mine ({ points, since, boosted } or null: never
    // used, so full). The bar itself is worked out in energy.js.
    energy: (server, userId) => s.energy.get(server, userId) ?? null,
    setEnergy: (server, userId, points, since) => s.setEnergy.run(server, userId, points, since),
    // Pays for a recovery item and applies it. False, and nothing changes,
    // if they can't afford it.
    buyBoost: (server, userId, cost, points, since, at) => atomic(() => {
      if (s.takeCents.run(cost, server, userId, cost).changes === 0) return false;
      s.boost.run(server, userId, points, since, at);
      return true;
    }),
    // An admin's energy settings for the server ({ max, every }), or null for the defaults.
    energySettings: (server) => s.energySettings.get(server) ?? null,
    setEnergySettings: (server, max, every) => s.setEnergySettings.run(server, max, every),
    // True when there were settings to remove.
    clearEnergySettings: (server) => s.clearEnergySettings.run(server).changes > 0,
    // Removes each { item, qty } from the box and pays `cents` for the lot.
    // False (and nothing changes) when any of them isn't there in full.
    sell: (server, userId, lots, cents) => atomic(() => {
      for (const { item, qty } of lots) {
        if (s.takeItem.run(qty, server, userId, item, qty).changes === 0) return false;
      }
      s.addCents.run(server, userId, cents);
      return true;
    }),

    close: () => db.close(),
  };
}
