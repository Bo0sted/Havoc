// Hospital bills for ?fish, ?mine and ?hunt: a share of what someone is
// worth (cash plus everything in their Backpack and safe; property doesn't
// count, since a bill can't take it), taken in brackets like income tax so crossing one never makes the
// bill jump. Gentle up to $100k, then steeper, so rich people hunting alone
// feel it (crew take that risk off them; see crew.js). Never more than they have.
import { randomInt } from 'node:crypto';
import { itemById, formatMoney } from './items.js';
import { liquidOf, label } from './storage.js';
import { gained, lost } from './colors.js';

// [up to, lowest rate, highest rate + 1] per bracket, rates in hundredths of
// a percent: 0.5-1.5% of the first $100k, 8-10% up to $250k, 15-20% up to
// $500k and 25-30% of anything above.
export const BRACKETS = [[10_000_000, 50, 151], [25_000_000, 800, 1_001], [50_000_000, 1_500, 2_001], [Infinity, 2_500, 3_001]];
// ?wheel's hospital and snake keep the bills from before: 1-4% of the first
// $100k, 8-10% of anything above.
export const WHEEL_BRACKETS = [[10_000_000, 100, 401], [Infinity, 800, 1_001]];

// Items are taken lowest tier first (junk, then common, up to legendary),
// cheapest first within a tier. Retired items can't be sold, so never.
const TAKEN_FIRST = ['trash', 'broken', 'common', 'rare', 'epic', 'legendary'];
export function takeable(id) {
  const item = itemById.get(id);
  const rank = TAKEN_FIRST.indexOf(item?.tier);
  return item && !item.retired && rank >= 0 ? { price: item.price, rank } : null;
}

// Each bracket's rate is drawn on its own. `scale` shrinks the whole bill
// for smaller injuries (?wheel's snake bite is a quarter of one).
export function hospitalBill(worth, scale = 1, brackets = BRACKETS) {
  let below = 0;
  let sum = 0;
  for (const [top, low, high] of brackets) {
    sum += Math.max(0, Math.min(worth, top) - below) * randomInt(low, high);
    below = top;
  }
  return Math.round((sum / 10_000) * scale);
}

// Bills someone and collects it: cash, then Backpack items, then safe
// items; anything left over is forgiven. Returns { bill, cash, taken,
// change, forgiven } (see db.payBill).
export function hospitalize(db, server, userId, scale = 1, brackets = BRACKETS) {
  const bill = hospitalBill(liquidOf(db, server, userId), scale, brackets);
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
