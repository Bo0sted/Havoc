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
  CREATE TABLE IF NOT EXISTS safe_items (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, item TEXT NOT NULL, qty INTEGER NOT NULL,
    PRIMARY KEY (server, user_id, item)
  );
  CREATE TABLE IF NOT EXISTS ammo (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, ammo TEXT NOT NULL, rounds INTEGER NOT NULL,
    PRIMARY KEY (server, user_id, ammo)
  );
  CREATE TABLE IF NOT EXISTS licenses (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, license TEXT NOT NULL,
    PRIMARY KEY (server, user_id, license)
  );
  CREATE TABLE IF NOT EXISTS command_counts (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, total INTEGER NOT NULL,
    day INTEGER NOT NULL, today INTEGER NOT NULL,
    PRIMARY KEY (server, user_id)
  );
  CREATE TABLE IF NOT EXISTS earnings (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, stream TEXT NOT NULL,
    earned INTEGER NOT NULL DEFAULT 0, lost INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (server, user_id, stream)
  );
  CREATE TABLE IF NOT EXISTS migrations (name TEXT NOT NULL PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS gifts_off (
    server TEXT NOT NULL, user_id INTEGER NOT NULL,
    PRIMARY KEY (server, user_id)
  );
  CREATE TABLE IF NOT EXISTS sell_settings (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, setting TEXT NOT NULL,
    PRIMARY KEY (server, user_id, setting)
  );
  CREATE TABLE IF NOT EXISTS pocket (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server TEXT NOT NULL, user_id INTEGER NOT NULL, charm TEXT NOT NULL, charges INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS pocket_owner ON pocket (server, user_id);
  CREATE TABLE IF NOT EXISTS jail (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, until INTEGER NOT NULL,
    PRIMARY KEY (server, user_id)
  );
  CREATE TABLE IF NOT EXISTS wheel_spins (
    server TEXT NOT NULL, user_id INTEGER NOT NULL,
    since INTEGER NOT NULL, free_used INTEGER NOT NULL, paid INTEGER NOT NULL,
    PRIMARY KEY (server, user_id)
  );
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server TEXT NOT NULL, user_id INTEGER NOT NULL,
    place TEXT NOT NULL, channel_id INTEGER NOT NULL, thread_id INTEGER,
    text TEXT NOT NULL, created INTEGER NOT NULL, due INTEGER NOT NULL,
    snoozes INTEGER NOT NULL DEFAULT 0,
    sent_at INTEGER, sent_code TEXT, sent_id INTEGER
  );
  CREATE INDEX IF NOT EXISTS reminders_owner ON reminders (server, user_id);
  CREATE INDEX IF NOT EXISTS reminders_due ON reminders (due) WHERE sent_at IS NULL;
  CREATE TABLE IF NOT EXISTS encryption_keys (
    server TEXT NOT NULL PRIMARY KEY, ecdh TEXT NOT NULL, signing TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS key_pins (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL,
    PRIMARY KEY (server, user_id, kind)
  );
  CREATE TABLE IF NOT EXISTS key_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server TEXT NOT NULL, at INTEGER NOT NULL, summary TEXT NOT NULL, details TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS key_log_server ON key_log (server);
  CREATE TABLE IF NOT EXISTS crew (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server TEXT NOT NULL, user_id INTEGER NOT NULL, job TEXT NOT NULL, name TEXT NOT NULL,
    hurt_until INTEGER NOT NULL DEFAULT 0, trips INTEGER NOT NULL DEFAULT 0, owed INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS crew_owner ON crew (server, user_id);
  CREATE TABLE IF NOT EXISTS payroll (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, since INTEGER NOT NULL, energy INTEGER NOT NULL,
    PRIMARY KEY (server, user_id)
  );
  CREATE TABLE IF NOT EXISTS overtime_relief (
    server TEXT NOT NULL, user_id INTEGER NOT NULL,
    PRIMARY KEY (server, user_id)
  );
  CREATE TABLE IF NOT EXISTS links (
    server TEXT NOT NULL, user_id INTEGER NOT NULL, to_server TEXT NOT NULL, to_user INTEGER NOT NULL,
    PRIMARY KEY (server, user_id)
  );
`;

// Columns added to a table after it first shipped: [table, column, definition].
const COLUMNS = [
  ['energy', 'surge_until', 'INTEGER NOT NULL DEFAULT 0'],
  ['crew', 'energy', 'INTEGER NOT NULL DEFAULT 0'],
];

// Everything that acts on one person's economy profile, as (server, userId,
// ...): in db.linked these follow ?link to the linked profile. A new economy
// one belongs here too, and nothing else does.
const PROFILE = [
  'cents', 'items', 'holdBet', 'settleBet', 'betStats', 'tool', 'tools', 'useTool', 'breakTool', 'buyTool', 'buyGun',
  'ammo', 'buyAmmo', 'useAmmo', 'licenses', 'giftsOff', 'setGiftsOff', 'sellSettings', 'setSellSetting', 'buyLicense',
  'countCommand', 'commandCount',
  'earnings', 'earn', 'lose', 'promoClaimed', 'claimPromoTool', 'claimPromoCash', 'addCents', 'takeUpTo', 'daily',
  'claimDaily', 'lotteryStreak', 'lotteryWin', 'lotteryLoss', 'addItem', 'energy', 'setEnergy', 'surge', 'pocket',
  'addCharm', 'jailedUntil', 'jail', 'wheelSpins', 'setWheelSpins', 'buyWheelSpin', 'takeItem', 'buyBoost', 'sell',
  'move', 'payBill', 'crew', 'hire', 'crewWorked', 'payroll', 'settlePayroll', 'relief', 'setRelief',
];

// A profile table's rows for everyone on server ?1, as (user_id, ...cols):
// their own, or (linkedRows) with someone who has a ?link getting the linked
// profile's rows, under their own id.
const ownRows = (table, cols) => `(SELECT user_id, ${cols} FROM ${table} WHERE server = ?1)`;
const linkedRows = (table, cols) => `(SELECT user_id, ${cols} FROM ${table}
  WHERE server = ?1 AND user_id NOT IN (SELECT user_id FROM links WHERE server = ?1)
  UNION ALL SELECT l.user_id, ${cols.map((c) => `t.${c}`)} FROM links l
  JOIN ${table} t ON t.server = l.to_server AND t.user_id = l.to_user WHERE l.server = ?1)`;

// The Backpack is the `items` table (it was the Safety Deposit Box, so
// everything people already had is in their Backpack); a safe is `safe_items`.
const PLACES = { backpack: 'items', safe: 'safe_items' };

export function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  // A log of Havoc's sent messages that a short-lived feature kept; gone.
  db.exec('DROP TABLE IF EXISTS own_messages');
  for (const [table, column, definition] of COLUMNS) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
  const q = (sql) => db.prepare(sql);
  // Server-wide totals and lists over `rows` (ownRows or linkedRows).
  const totals = (rows) => ({
    totalCents: q(`SELECT COALESCE(SUM(cents), 0) AS cents FROM ${rows('wallets', ['cents'])}`),
    totalItems: q(`SELECT item, SUM(qty) AS qty FROM (SELECT item, qty FROM ${rows('items', ['item', 'qty'])}
      UNION ALL SELECT item, qty FROM ${rows('safe_items', ['item', 'qty'])}) WHERE qty > 0 GROUP BY item`),
    wallets: q(`SELECT user_id, cents FROM ${rows('wallets', ['cents'])}`),
    allItems: q(`SELECT user_id, item, qty FROM ${rows('items', ['item', 'qty'])} WHERE qty > 0
      UNION ALL SELECT user_id, item, qty FROM ${rows('safe_items', ['item', 'qty'])} WHERE qty > 0`),
  });

  const s = {
    overrides: q('SELECT command, ms FROM cooldown_overrides WHERE server = ?'),
    setOverride: q('INSERT INTO cooldown_overrides (server, command, ms) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET ms = excluded.ms'),
    clearOverride: q('DELETE FROM cooldown_overrides WHERE server = ? AND command = ?'),
    blockedUntil: q('SELECT until FROM guest_blocks WHERE server = ? AND user_id = ?'),
    block: q('INSERT INTO guest_blocks (server, user_id, until) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET until = excluded.until'),
    purgeBlocks: q('DELETE FROM guest_blocks WHERE until <= ?'),
    cents: q('SELECT cents FROM wallets WHERE server = ? AND user_id = ?'),
    ...placeStatements(q),
    botChannels: q('SELECT channel_id FROM bot_channels WHERE server = ? ORDER BY rowid'),
    addBotChannel: q('INSERT OR IGNORE INTO bot_channels (server, channel_id) VALUES (?, ?)'),
    removeBotChannel: q('DELETE FROM bot_channels WHERE server = ? AND channel_id = ?'),
    ...totals(ownRows),
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
    addCents: q('INSERT INTO wallets (server, user_id, cents) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET cents = cents + excluded.cents'),
    energy: q('SELECT points, since, boosted, surge_until FROM energy WHERE server = ? AND user_id = ?'),
    surge: q('INSERT INTO energy (server, user_id, points, since, surge_until) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET points = excluded.points, since = excluded.since, surge_until = excluded.surge_until'),
    pocket: q('SELECT id, charm, charges FROM pocket WHERE server = ? AND user_id = ? ORDER BY id'),
    addCharm: q('INSERT INTO pocket (server, user_id, charm, charges) VALUES (?, ?, ?, ?)'),
    spendCharge: q('UPDATE pocket SET charges = charges - 1 WHERE id = ?'),
    dropSpentCharms: q('DELETE FROM pocket WHERE id = ? AND charges <= 0'),
    jailedUntil: q('SELECT until FROM jail WHERE server = ? AND user_id = ?'),
    jail: q('INSERT INTO jail (server, user_id, until) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET until = excluded.until'),
    purgeJail: q('DELETE FROM jail WHERE until <= ?'),
    wheelSpins: q('SELECT since, free_used, paid FROM wheel_spins WHERE server = ? AND user_id = ?'),
    setWheelSpins: q('INSERT INTO wheel_spins (server, user_id, since, free_used, paid) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET since = excluded.since, free_used = excluded.free_used, paid = excluded.paid'),
    setEnergy: q('INSERT INTO energy (server, user_id, points, since) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET points = excluded.points, since = excluded.since'),
    boost: q('INSERT INTO energy (server, user_id, points, since, boosted) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET points = excluded.points, since = excluded.since, boosted = excluded.boosted'),
    energySettings: q('SELECT max, every FROM energy_settings WHERE server = ?'),
    setEnergySettings: q('INSERT INTO energy_settings (server, max, every) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET max = excluded.max, every = excluded.every'),
    clearEnergySettings: q('DELETE FROM energy_settings WHERE server = ?'),
    ammo: q('SELECT ammo, rounds FROM ammo WHERE server = ? AND user_id = ? AND rounds > 0'),
    addAmmo: q('INSERT INTO ammo (server, user_id, ammo, rounds) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET rounds = rounds + excluded.rounds'),
    useAmmo: q('UPDATE ammo SET rounds = rounds - 1 WHERE server = ? AND user_id = ? AND ammo = ? AND rounds > 0'),
    dropAmmo: q('DELETE FROM ammo WHERE server = ? AND user_id = ?'),
    licenses: q('SELECT license FROM licenses WHERE server = ? AND user_id = ? ORDER BY rowid'),
    addLicense: q('INSERT OR IGNORE INTO licenses (server, user_id, license) VALUES (?, ?, ?)'),
    commandCount: q('SELECT total, day, today FROM command_counts WHERE server = ? AND user_id = ?'),
    earnings: q('SELECT stream, earned, lost FROM earnings WHERE server = ? AND user_id = ? ORDER BY rowid'),
    earn: q('INSERT INTO earnings (server, user_id, stream, earned) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET earned = earned + excluded.earned'),
    lose: q('INSERT INTO earnings (server, user_id, stream, lost) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET lost = lost + excluded.lost'),
    giftsOff: q('SELECT 1 FROM gifts_off WHERE server = ? AND user_id = ?'),
    turnGiftsOff: q('INSERT OR IGNORE INTO gifts_off (server, user_id) VALUES (?, ?)'),
    turnGiftsOn: q('DELETE FROM gifts_off WHERE server = ? AND user_id = ?'),
    sellSettings: q('SELECT setting FROM sell_settings WHERE server = ? AND user_id = ?'),
    sellSettingOn: q('INSERT OR IGNORE INTO sell_settings (server, user_id, setting) VALUES (?, ?, ?)'),
    sellSettingOff: q('DELETE FROM sell_settings WHERE server = ? AND user_id = ? AND setting = ?'),
    migrated: q('SELECT 1 FROM migrations WHERE name = ?'),
    migrate: q('INSERT INTO migrations (name) VALUES (?)'),
    everyWallet: q('SELECT server, user_id, cents FROM wallets'),
    everyItem: q('SELECT server, user_id, item, qty FROM items WHERE qty > 0 UNION ALL SELECT server, user_id, item, qty FROM safe_items WHERE qty > 0'),
    setCommandCount: q(`INSERT INTO command_counts (server, user_id, total, day, today) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT DO UPDATE SET total = excluded.total, day = excluded.day, today = excluded.today`),
    reminders: q('SELECT * FROM reminders WHERE server = ? AND user_id = ? AND sent_at IS NULL ORDER BY due, id'),
    countReminders: q('SELECT COUNT(*) AS n FROM reminders WHERE server = ? AND user_id = ? AND sent_at IS NULL'),
    addReminder: q('INSERT INTO reminders (server, user_id, place, channel_id, thread_id, text, created, due) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    dueReminders: q('SELECT * FROM reminders WHERE sent_at IS NULL AND due <= ? ORDER BY due, id'),
    nextReminder: q('SELECT MIN(due) AS due FROM reminders WHERE sent_at IS NULL AND due > ?'),
    deleteReminder: q('DELETE FROM reminders WHERE id = ?'),
    reminderSent: q('UPDATE reminders SET sent_at = ?, sent_code = ?, sent_id = ? WHERE id = ? AND sent_at IS NULL'),
    latestSentReminder: q('SELECT * FROM reminders WHERE server = ? AND user_id = ? AND sent_at >= ? ORDER BY sent_at DESC, id DESC LIMIT 1'),
    reminderBySent: q('SELECT * FROM reminders WHERE server = ? AND sent_id = ? AND sent_at IS NOT NULL'),
    snoozeReminder: q('UPDATE reminders SET due = ?, snoozes = snoozes + 1, sent_at = NULL, sent_code = NULL, sent_id = NULL WHERE id = ? AND sent_at IS NOT NULL'),
    purgeReminders: q('DELETE FROM reminders WHERE sent_at IS NOT NULL AND sent_at < ?'),
    encryptionKeys: q('SELECT ecdh, signing FROM encryption_keys WHERE server = ?'),
    setEncryptionKeys: q('INSERT INTO encryption_keys (server, ecdh, signing) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET ecdh = excluded.ecdh, signing = excluded.signing'),
    keyPin: q('SELECT key FROM key_pins WHERE server = ? AND user_id = ? AND kind = ?'),
    keyPins: q('SELECT user_id, kind, key FROM key_pins WHERE server = ? ORDER BY rowid'),
    setKeyPin: q('INSERT INTO key_pins (server, user_id, kind, key) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET key = excluded.key'),
    logKey: q('INSERT INTO key_log (server, at, summary, details) VALUES (?, ?, ?, ?)'),
    keyLog: q('SELECT id, server, at, summary, details FROM key_log ORDER BY id'),
    crew: q('SELECT * FROM crew WHERE server = ? AND user_id = ? ORDER BY id'),
    hire: q('INSERT INTO crew (server, user_id, job, name) VALUES (?, ?, ?, ?)'),
    fire: q('DELETE FROM crew WHERE id = ?'),
    renameCrew: q('UPDATE crew SET name = ? WHERE id = ?'),
    crewWorked: q('UPDATE crew SET owed = owed + ?, trips = trips + 1, energy = energy + ? WHERE id = ?'),
    hurtCrew: q('UPDATE crew SET hurt_until = ? WHERE id = ?'),
    payroll: q('SELECT since, energy FROM payroll WHERE server = ? AND user_id = ?'),
    addPayroll: q('INSERT INTO payroll (server, user_id, since, energy) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET energy = energy + excluded.energy'),
    paidCrew: q('UPDATE crew SET owed = 0, trips = 0, energy = 0 WHERE server = ? AND user_id = ?'),
    relief: q('SELECT 1 FROM overtime_relief WHERE server = ? AND user_id = ?'),
    reliefOn: q('INSERT OR IGNORE INTO overtime_relief (server, user_id) VALUES (?, ?)'),
    reliefOff: q('DELETE FROM overtime_relief WHERE server = ? AND user_id = ?'),
    dropPayroll: q('DELETE FROM payroll WHERE server = ? AND user_id = ?'),
    link: q('SELECT * FROM links WHERE server = ? AND user_id = ?'),
    linkOf: q('SELECT * FROM links WHERE (server = ?1 AND user_id = ?2) OR (to_server = ?1 AND to_user = ?2)'),
    links: q('SELECT * FROM links ORDER BY rowid'),
    setLink: q('INSERT INTO links (server, user_id, to_server, to_user) VALUES (?, ?, ?, ?)'),
    unlink: q('DELETE FROM links WHERE server = ? AND user_id = ?'),
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

  // The profile someone's rows are under in db.linked: the one linked in
  // place of theirs (?link), or their own.
  function profileOf(server, userId) {
    const link = s.link.get(server, userId);
    return link ? [link.to_server, link.to_user] : [server, userId];
  }

  // A gift: `cents` from one wallet to the other and each { item, qty }
  // from one Backpack to the other, recorded in 'gifts' as `value` cents
  // given and received. `giver` and `taker` are [server, userId], so in
  // db.linked either can be a profile on another server. False (and nothing
  // changes) when the giver doesn't have all of it.
  const transfer = (giver, taker, { cents = 0, lots = [] }, value) => atomic(() => {
    if (cents > 0) {
      if (s.takeCents.run(cents, ...giver, cents).changes === 0) return false;
      s.addCents.run(...taker, cents);
    }
    for (const { item, qty } of lots) {
      if (s.backpack.take.run(qty, ...giver, item, qty).changes === 0) return false;
      s.backpack.add.run(...taker, item, qty);
    }
    s.lose.run(...giver, 'gifts', value);
    s.earn.run(...taker, 'gifts', value);
    return true;
  });

  // Bets still held when Havoc last stopped never finished: hand them back.
  atomic(() => {
    for (const bet of s.pendingBets.all()) {
      s.addCents.run(bet.server, bet.user_id, bet.cents);
      s.dropBet.run(bet.server, bet.user_id);
    }
  });

  const api = {
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
    // What someone keeps in their Backpack (the default) or safe, as { item, qty }.
    items: (server, userId, place = 'backpack') => s[place].items.all(server, userId),
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
    // The tool turns into its broken item in the Backpack.
    breakTool: (server, userId, kind, brokenItem) => atomic(() => {
      s.dropTool.run(server, userId, kind);
      s.backpack.add.run(server, userId, brokenItem, 1);
    }),
    // Pays `cost` and puts a fresh tool in that slot (replacing the old one,
    // which was traded in). False, and nothing changes, if they can't afford it.
    buyTool: (server, userId, kind, item, cost) => atomic(() => {
      if (cost > 0 && s.takeCents.run(cost, server, userId, cost).changes === 0) return false;
      s.setTool.run(server, userId, kind, item);
      return true;
    }),
    // A gun, as buyTool; the old gun's ammo (which won't fit the new one)
    // goes with the trade-in.
    buyGun: (server, userId, item, cost) => atomic(() => {
      if (cost > 0 && s.takeCents.run(cost, server, userId, cost).changes === 0) return false;
      s.setTool.run(server, userId, 'gun', item);
      s.dropAmmo.run(server, userId);
      return true;
    }),
    // Rounds left for each ammo someone has, as a Map of ammo id → rounds.
    ammo: (server, userId) => new Map(s.ammo.all(server, userId).map((r) => [r.ammo, r.rounds])),
    // Pays for a box of ammo. False, and nothing changes, if they can't afford it.
    buyAmmo: (server, userId, ammo, rounds, cost) => atomic(() => {
      if (cost > 0 && s.takeCents.run(cost, server, userId, cost).changes === 0) return false;
      s.addAmmo.run(server, userId, ammo, rounds);
      return true;
    }),
    // Fires one round. False if there wasn't one.
    useAmmo: (server, userId, ammo) => s.useAmmo.run(server, userId, ammo).changes > 0,
    licenses: (server, userId) => s.licenses.all(server, userId).map((r) => r.license),
    // Whether someone turned gifts off (?give off): nobody can give them anything.
    giftsOff: (server, userId) => !!s.giftsOff.get(server, userId),
    // True when it changed (false if it was already that way).
    setGiftsOff: (server, userId, off) =>
      (off ? s.turnGiftsOff.run(server, userId) : s.turnGiftsOn.run(server, userId)).changes > 0,
    // The ?sell settings someone turned on, as a Set of ids (everything else is off).
    sellSettings: (server, userId) => new Set(s.sellSettings.all(server, userId).map((r) => r.setting)),
    // True when it changed (false if it was already that way).
    setSellSetting: (server, userId, setting, on) =>
      (on ? s.sellSettingOn : s.sellSettingOff).run(server, userId, setting).changes > 0,
    // Pays for a license. False, and nothing changes, if they can't afford it.
    buyLicense: (server, userId, license, cost) => atomic(() => {
      if (cost > 0 && s.takeCents.run(cost, server, userId, cost).changes === 0) return false;
      s.addLicense.run(server, userId, license);
      return true;
    }),
    // Counts one economy command. Only `cap` a day (UTC) count; past that it
    // returns null. Otherwise { total, reward }, with `rewardFor(total)`
    // paid out in the same transaction.
    countCommand: (server, userId, day, cap, rewardFor) => atomic(() => {
      const row = s.commandCount.get(server, userId);
      const today = row?.day === day ? row.today : 0;
      if (today >= cap) return null;
      const total = (row?.total ?? 0) + 1;
      s.setCommandCount.run(server, userId, total, day, today + 1);
      const reward = rewardFor(total);
      if (reward > 0) {
        s.addCents.run(server, userId, reward);
        s.earn.run(server, userId, 'milestones', reward);
      }
      return { total, reward };
    }),
    // Someone's money-making command count ({ total } or null if none yet).
    commandCount: (server, userId) => s.commandCount.get(server, userId) ?? null,
    // Money someone has made (earned) and lost, per stream: totals that only
    // ever go up. Rows as { stream, earned, lost }.
    earnings: (server, userId) => s.earnings.all(server, userId),
    earn: (server, userId, stream, cents) => cents > 0 && s.earn.run(server, userId, stream, cents),
    lose: (server, userId, stream, cents) => cents > 0 && s.lose.run(server, userId, stream, cents),
    // Once, when earnings tracking arrived: everyone already here starts
    // with their net worth (cash plus Backpack and safe, at `valueOf`) as
    // 'before'. Their old bets stay in ?bet record.
    seedEarnings: (valueOf) => atomic(() => {
      if (s.migrated.get('earnings')) return;
      const worth = new Map();
      const key = (server, userId) => `${server}\n${userId}`;
      const add = (server, userId, cents) => {
        const k = key(server, userId);
        worth.set(k, { server, userId, cents: (worth.get(k)?.cents ?? 0) + cents });
      };
      for (const w of s.everyWallet.all()) add(w.server, w.user_id, w.cents);
      for (const i of s.everyItem.all()) add(i.server, i.user_id, valueOf(i.item, i.qty));
      for (const { server, userId, cents } of worth.values()) if (cents > 0) s.earn.run(server, userId, 'before', cents);
      s.migrate.run('earnings');
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
    addItem: (server, userId, item, qty = 1) => s.backpack.add.run(server, userId, item, qty),
    // Energy for ?fish and ?mine ({ points, since, boosted } or null: never
    // used, so full). The bar itself is worked out in energy.js.
    energy: (server, userId) => s.energy.get(server, userId) ?? null,
    setEnergy: (server, userId, points, since) => s.setEnergy.run(server, userId, points, since),
    // An Energy Surge: the bar's max doubles until `until`, and it's `points` now.
    surge: (server, userId, points, since, until) => s.surge.run(server, userId, points, since, until),
    // Charms in someone's Pocket ([{ id, charm, charges }]); using one takes a
    // charge, and it's gone with its last.
    pocket: (server, userId) => s.pocket.all(server, userId),
    addCharm: (server, userId, charm, charges) => s.addCharm.run(server, userId, charm, charges),
    useCharm: (id) => atomic(() => {
      s.spendCharge.run(id);
      s.dropSpentCharms.run(id);
    }),
    // ?wheel jail: no economy commands until then (0 when free).
    jailedUntil: (server, userId) => s.jailedUntil.get(server, userId)?.until ?? 0,
    jail: (server, userId, until) => s.jail.run(server, userId, until),
    purgeJail: (now = Date.now()) => s.purgeJail.run(now),
    // Someone's ?wheel day ({ since, free_used, paid } or null): when their
    // first free spin of it was, and how many free and paid spins since.
    wheelSpins: (server, userId) => s.wheelSpins.get(server, userId) ?? null,
    setWheelSpins: (server, userId, since, freeUsed, paid) => s.setWheelSpins.run(server, userId, since, freeUsed, paid),
    // Pays for a paid spin and records it. False, and nothing changes, if
    // they can't afford it.
    buyWheelSpin: (server, userId, cost, since, freeUsed, paid) => atomic(() => {
      if (s.takeCents.run(cost, server, userId, cost).changes === 0) return false;
      s.setWheelSpins.run(server, userId, since, freeUsed, paid);
      return true;
    }),
    // Takes one of an item from the Backpack. False if there wasn't one.
    takeItem: (server, userId, item) => s.backpack.take.run(1, server, userId, item, 1).changes > 0,
    // Pays for a recovery item and applies it. False, and nothing changes,
    // if they can't afford it.
    buyBoost: (server, userId, cost, points, since, at) => atomic(() => {
      if (cost > 0 && s.takeCents.run(cost, server, userId, cost).changes === 0) return false;
      s.boost.run(server, userId, points, since, at);
      return true;
    }),
    // An admin's energy settings for the server ({ max, every }), or null for the defaults.
    energySettings: (server) => s.energySettings.get(server) ?? null,
    setEnergySettings: (server, max, every) => s.setEnergySettings.run(server, max, every),
    // True when there were settings to remove.
    clearEnergySettings: (server) => s.clearEnergySettings.run(server).changes > 0,
    // Removes each { item, qty } from the Backpack (or safe) and pays
    // `cents` for the lot. False (and nothing changes) when any of them
    // isn't there in full.
    sell: (server, userId, lots, cents, place = 'backpack') => atomic(() => {
      for (const { item, qty } of lots) {
        if (s[place].take.run(qty, server, userId, item, qty).changes === 0) return false;
      }
      s.addCents.run(server, userId, cents);
      return true;
    }),
    // Moves each { item, qty } between the Backpack and the safe. False (and
    // nothing changes) when any of them isn't there in full.
    move: (server, userId, lots, from, to) => atomic(() => {
      for (const { item, qty } of lots) {
        if (s[from].take.run(qty, server, userId, item, qty).changes === 0) return false;
        s[to].add.run(server, userId, item, qty);
      }
      return true;
    }),
    give: (server, from, to, gift, value) => transfer([server, from], [server, to], gift, value),
    // A hospital bill of up to `bill` cents: cash first, then Backpack items,
    // then safe items, in the order `takeable(id)` ranks them ({ price, rank },
    // or null for anything that can't be sold and so is never taken). An
    // item worth more than what's left of the bill is taken whole and the
    // difference paid back; whatever can't be covered is forgiven (nobody
    // goes into debt). Returns { cash, taken: [{ item, qty }], change, forgiven }.
    payBill: (server, userId, bill, takeable) => atomic(() => {
      const cash = Math.min(bill, s.cents.get(server, userId)?.cents ?? 0);
      if (cash > 0) s.takeCents.run(cash, server, userId, cash);
      let owed = bill - cash;
      const taken = [];
      for (const place of ['backpack', 'safe']) {
        const rows = s[place].items.all(server, userId)
          .map((r) => ({ ...r, ...takeable(r.item) }))
          .filter((r) => r.price > 0)
          .sort((a, b) => a.rank - b.rank || a.price - b.price);
        for (const r of rows) {
          if (owed <= 0) break;
          const qty = Math.min(r.qty, Math.ceil(owed / r.price));
          s[place].take.run(qty, server, userId, r.item, qty);
          taken.push({ item: r.item, qty });
          owed -= qty * r.price;
        }
      }
      const change = Math.max(0, -owed);
      if (change > 0) s.addCents.run(server, userId, change);
      return { cash, taken, change, forgiven: Math.max(0, owed) };
    }),

    // Reminders waiting to go off, soonest first. Once one goes off it's
    // marked sent (with where its message is) and kept a while for snoozing.
    reminders: (server, userId) => s.reminders.all(server, userId),
    // { place, channelId, threadId, text, created, due }. False, and nothing
    // added, when they already have `max` waiting.
    addReminder: (server, userId, r, max) => atomic(() => {
      if (s.countReminders.get(server, userId).n >= max) return false;
      s.addReminder.run(server, userId, r.place, r.channelId, r.threadId ?? null, r.text, r.created, r.due);
      return true;
    }),
    // Every server's reminders due by `now`, and when the next one after that is (or null).
    dueReminders: (now) => s.dueReminders.all(now),
    nextReminder: (now) => s.nextReminder.get(now).due,
    deleteReminder: (id) => s.deleteReminder.run(id),
    reminderSent: (id, at, code, messageId) => s.reminderSent.run(at, code, messageId, id),
    latestSentReminder: (server, userId, since) => s.latestSentReminder.get(server, userId, since) ?? null,
    reminderBySent: (server, messageId) => s.reminderBySent.get(server, messageId) ?? null,
    // Back to waiting until `due`. False if it was already snoozed (or gone).
    snoozeReminder: (id, due) => s.snoozeReminder.run(due, id).changes > 0,
    purgeReminders: (before) => s.purgeReminders.run(before),

    // One server's encryption storage (see Encryption): Havoc's own keys as
    // private JWKs ({ ecdh, signing } or null), the key pinned for each
    // person ('encryption' or 'signing', as "x.y"), and the key log.
    keyStore: (server) => ({
      load: () => {
        const row = s.encryptionKeys.get(server);
        return row ? { ecdh: JSON.parse(row.ecdh), signing: JSON.parse(row.signing) } : null;
      },
      save: ({ ecdh, signing }) => s.setEncryptionKeys.run(server, JSON.stringify(ecdh), JSON.stringify(signing)),
      pin: (userId, kind) => s.keyPin.get(server, userId, kind)?.key ?? null,
      setPin: (userId, kind, key) => s.setKeyPin.run(server, userId, kind, key),
      // Once per server: every key pinned so far (from when first-seen keys
      // weren't logged yet); empty every time after that.
      unloggedPins: () => atomic(() => {
        const name = `key-log-pins:${server}`;
        if (s.migrated.get(name)) return [];
        s.migrate.run(name);
        return s.keyPins.all(server);
      }),
      // `details` is a list of [label, value] lines.
      log: (summary, details) => s.logKey.run(server, Date.now(), summary, JSON.stringify(details)),
    }),
    // Every server's key log, oldest first, as { id, server, at, summary, details }.
    keyLog: () => s.keyLog.all().map((r) => ({ ...r, details: JSON.parse(r.details) })),

    // Someone's crew (crew.js), oldest hire first, as { id, job, name,
    // hurt_until, trips, owed, energy }: trips worked, wages owed and the
    // trips' energy since payday.
    crew: (server, userId) => s.crew.all(server, userId),
    // Pays `cost` and hires them. False, and nothing changes, if they can't afford it.
    hire: (server, userId, job, name, cost) => atomic(() => {
      if (cost > 0 && s.takeCents.run(cost, server, userId, cost).changes === 0) return false;
      s.hire.run(server, userId, job, name);
      return true;
    }),
    fire: (id) => s.fire.run(id),
    renameCrew: (id, name) => s.renameCrew.run(name, id),
    // One trip: each crewmate in `pay` ({ id, wage }) is owed their wage more
    // and worked the trip's `energy`, the one in `hurt` ({ id, until }, or
    // null) is out until then, and the payroll counts the trip (a payday
    // starts counting at `now`, its first trip).
    crewWorked: (server, userId, pay, energy, now, hurt) => atomic(() => {
      for (const { id, wage } of pay) s.crewWorked.run(wage, energy, id);
      if (hurt) s.hurtCrew.run(hurt.until, hurt.id);
      s.addPayroll.run(server, userId, now, energy);
    }),
    // The payroll running since the last payday ({ since, energy }), or null.
    payroll: (server, userId) => s.payroll.get(server, userId) ?? null,
    // Whether crew who reach overtime sit out until payday (?crew overtime on).
    relief: (server, userId) => !!s.relief.get(server, userId),
    setRelief: (server, userId, on) => (on ? s.reliefOn.run(server, userId) : s.reliefOff.run(server, userId)),
    // Payday is over: the crew in `quit` leave, and everyone else starts
    // owing nothing again.
    settlePayroll: (server, userId, quit) => atomic(() => {
      for (const id of quit) s.fire.run(id);
      s.paidCrew.run(server, userId);
      s.dropPayroll.run(server, userId);
    }),

    // ?link: someone's profile on one server used in place of theirs on
    // another, as { server, user_id, to_server, to_user }. Their own rows
    // stay as they are, and come back when the link is removed. A profile is
    // in one link at most, on either side; linkOf finds it.
    linkOf: (server, userId) => s.linkOf.get(server, userId) ?? null,
    links: () => s.links.all(),
    link: (server, userId, toServer, toUser) => s.setLink.run(server, userId, toServer, toUser),
    // True when there was a link to remove.
    unlink: (server, userId) => s.unlink.run(server, userId).changes > 0,
    // Always your own here; db.linked follows ?link.
    profileOf: (server, userId) => [server, userId],

    close: () => db.close(),
  };

  // ?link only applies to economy commands: the router gives them this
  // instead, where everything on one person's profile (PROFILE, gifts and
  // server totals) uses the linked profile. Everything else is the same.
  const sums = totals(linkedRows);
  const linked = {
    ...api,
    profileOf,
    give: (server, from, to, gift, value) => transfer(profileOf(server, from), profileOf(server, to), gift, value),
    totalCents: (server) => sums.totalCents.get(server).cents,
    totalItems: (server) => sums.totalItems.all(server),
    wallets: (server) => sums.wallets.all(server),
    allItems: (server) => sums.allItems.all(server),
  };
  for (const name of PROFILE) linked[name] = (server, userId, ...rest) => api[name](...profileOf(server, userId), ...rest);
  return { ...api, linked };
}

// The same statements for the Backpack and the safe, as s.backpack / s.safe.
function placeStatements(q) {
  return Object.fromEntries(Object.entries(PLACES).map(([place, table]) => [place, {
    items: q(`SELECT item, qty FROM ${table} WHERE server = ? AND user_id = ? AND qty > 0`),
    add: q(`INSERT INTO ${table} (server, user_id, item, qty) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET qty = qty + excluded.qty`),
    take: q(`UPDATE ${table} SET qty = qty - ? WHERE server = ? AND user_id = ? AND item = ? AND qty >= ?`),
  }]));
}
