// Energy for physical actions (?fish costs 1, ?mine 4): a bar of `max`
// points that refills by one every `every` ms. Stored as the points someone
// had at `since`; what they have now is worked out from the time passed, so
// nothing has to tick. Admins are limited too.
export const DEFAULTS = { max: 60, every: 60_000 };

// Recovery items, sold in ?shop and used up on the spot, one per
// BOOST_COOLDOWN. A point of energy catches ~$210 on average (fish and mine
// alike), so each costs more than the catches it buys: they never pay.
// Check these again if catch odds or item prices change. Ids are stored
// (as the time of the last one), so never rename one.
export const BOOST_COOLDOWN = 3_600_000;
export const BOOSTS = [
  { id: 'sports_massage', name: 'Sports Massage', price: 600_000, energy: 20 },
  { id: 'cryotherapy', name: 'Cryotherapy Session', price: 1_100_000, energy: 40 },
  { id: 'iv_drip', name: 'IV Drip Therapy', price: 1_500_000, energy: Infinity }, // a full bar
];

export const settingsFor = (db, server) => db.energySettings(server) ?? DEFAULTS;

// Someone's bar right now: points, max, every, `since` (where the clock
// toward the next point started), `next` (ms until it, 0 when full) and
// `boostIn` (ms until another recovery item is allowed, 0 when it is).
export function energyOf(db, server, userId, now = Date.now()) {
  const { max, every } = settingsFor(db, server);
  const row = db.energy(server, userId);
  if (!row) return { points: max, max, every, since: now, next: 0, boostIn: 0 };
  const gained = Math.floor((now - row.since) / every);
  const points = Math.min(max, row.points + gained);
  // While not full, the clock keeps its progress toward the next point.
  const since = points >= max ? now : row.since + gained * every;
  return { points, max, every, since, next: points >= max ? 0 : since + every - now, boostIn: Math.max(0, row.boosted + BOOST_COOLDOWN - now) };
}

// Ms until the bar has `cost` points (0 if it already has).
export const waitFor = (bar, cost) => (bar.points >= cost ? 0 : bar.next + (cost - bar.points - 1) * bar.every);

// Takes `cost` points. False, and nothing changes, if there aren't enough.
export function spend(db, server, userId, cost) {
  const bar = energyOf(db, server, userId);
  if (bar.points < cost) return false;
  db.setEnergy(server, userId, bar.points - cost, bar.since);
  return true;
}

// What a recovery item would do to this bar: the points after it, and how
// many would go to waste over the max.
export function boosted(bar, boost) {
  const points = Math.min(bar.max, bar.points + boost.energy);
  return { points, wasted: boost.energy === Infinity ? 0 : bar.points + boost.energy - points };
}
