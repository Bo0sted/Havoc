// Hospital bills for ?hunt: a share of what someone is worth (cash plus
// everything in their Backpack and safe, as ?top counts it), so it stings at
// every level. 1-4% of the first $100k, 8-10% of anything above that, so
// crossing $100k doesn't make the bill jump. Never more than they have.
import { randomInt } from 'node:crypto';
import { itemById } from './items.js';
import { worthOf } from './storage.js';

const BRACKET = 10_000_000; // $100k, in cents

// Items are taken lowest tier first (junk, then common, up to legendary),
// cheapest first within a tier. Retired items can't be sold, so never.
const TAKEN_FIRST = ['trash', 'broken', 'common', 'rare', 'epic', 'legendary'];
function takeable(id) {
  const item = itemById.get(id);
  const rank = TAKEN_FIRST.indexOf(item?.tier);
  return item && !item.retired && rank >= 0 ? { price: item.price, rank } : null;
}

// Rates are drawn in hundredths of a percent.
export function hospitalBill(worth) {
  const low = Math.min(worth, BRACKET);
  const high = Math.max(0, worth - BRACKET);
  return Math.round((low * randomInt(100, 401) + high * randomInt(800, 1001)) / 10_000);
}

// Bills someone and collects it: cash, then Backpack items, then safe
// items; anything left over is forgiven. Returns { bill, cash, taken,
// change, forgiven } (see db.payBill).
export function hospitalize(db, server, userId) {
  const bill = hospitalBill(worthOf(db, server, userId));
  return { bill, ...db.payBill(server, userId, bill, takeable) };
}
