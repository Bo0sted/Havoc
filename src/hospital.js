// Hospital bills for ?hunt: a share of what someone is worth (cash plus
// everything in their Backpack and safe, as ?top counts it), so it stings at
// every level. 1-4% of the first $100k, 8-10% of anything above that, so
// crossing $100k doesn't make the bill jump. Never more than they have.
import { randomInt } from 'node:crypto';
import { itemById, formatMoney } from './items.js';
import { worthOf, label } from './storage.js';
import { gained, lost } from './colors.js';

const BRACKET = 10_000_000; // $100k, in cents

// Items are taken lowest tier first (junk, then common, up to legendary),
// cheapest first within a tier. Retired items can't be sold, so never.
const TAKEN_FIRST = ['trash', 'broken', 'common', 'rare', 'epic', 'legendary'];
export function takeable(id) {
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
// `cap` limits the bill (?wheel's hospital slice).
export function hospitalize(db, server, userId, cap = Infinity) {
  const bill = Math.min(hospitalBill(worthOf(db, server, userId)), cap);
  return { bill, ...db.payBill(server, userId, bill, takeable) };
}

// "Hospital bill: **$X**. You paid it in cash." and so on. `title` and
// `by` reword it for other bills (?wheel's money losses).
export function billLine({ bill, cash, taken, change, forgiven }, { title = 'Hospital bill', by = 'the hospital' } = {}) {
  const By = by[0].toUpperCase() + by.slice(1);
  if (!bill || forgiven === bill) return `${By} let you off: you've got nothing to pay with.`;
  const head = `${title}: **${lost(bill)}**.`;
  const rest = forgiven ? ` You couldn't cover the last ${formatMoney(forgiven)}, so ${by} let it go.` : '';
  if (!taken.length) return `${head} You paid ${forgiven ? lost(cash) : 'it'} in cash.${rest}`;
  const items = taken.map((t) => label(itemById.get(t.item), t.qty)).join(', ');
  const back = change ? ` (${gained(change)} back in change)` : '';
  return cash
    ? `${head} You paid ${lost(cash)} in cash and ${by} took ${items}${forgiven ? '' : ' for the rest'}${back}.${rest}`
    : `${head} You had no cash, so ${by} took ${items}${back}.${rest}`;
}
