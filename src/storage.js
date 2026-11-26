// The Backpack (where every catch lands) and the safe: how much room each
// has, and turning "<item> [amount|all]", "<category>" or "all" into the
// stacks it means. Retired items take no space and can't be chosen.
import { ITEMS, itemById, valueOf } from './items.js';
import { toolById, propertyValue } from './tools.js';
import { rarity } from './colors.js';

export const BACKPACK_SPACE = 100;
export const TIERS = new Set(ITEMS.map((i) => i.tier));

const order = new Map(ITEMS.map((item, i) => [item.id, i]));

// Someone's safe (from the shop), or null.
export function safeOf(db, server, userId) {
  return toolById.get(db.tool(server, userId, 'safe')?.item) ?? null;
}

// What someone's crew outfits are worth (see propertyValue).
const propertyOf = (db, server, userId) =>
  db.tools(server, userId).reduce((sum, t) => sum + propertyValue(t.item), 0);

// Cash plus everything in the Backpack and safe at its sell price: all a
// bill can take, so what hospital bills are a share of.
export function liquidOf(db, server, userId) {
  const rows = [...db.items(server, userId), ...db.items(server, userId, 'safe')];
  return db.cents(server, userId) + rows.reduce((sum, r) => sum + valueOf(r.item, r.qty), 0);
}

// Net worth: that plus property (what ?top ranks by).
export const worthOf = (db, server, userId) => liquidOf(db, server, userId) + propertyOf(db, server, userId);

// Items that count toward the space a place has.
export const used = (rows) => rows.reduce((n, r) => n + (itemById.get(r.item)?.retired ? 0 : r.qty), 0);

// { rows, used, space } for someone's Backpack or safe (space 0 if they have no safe).
export function placeOf(db, server, userId, place) {
  const rows = db.items(server, userId, place).filter((r) => itemById.has(r.item));
  const space = place === 'backpack' ? BACKPACK_SPACE : safeOf(db, server, userId)?.space ?? 0;
  return { rows, used: used(rows), space };
}

// "3 🐟 Salmon, 1 🦌 Bull Elk" in catalogue order, or "empty"; epics and
// legendaries in their colours.
export function contents(rows) {
  if (!rows.length) return 'empty';
  return [...rows].sort((a, b) => order.get(a.item) - order.get(b.item))
    .map((r) => { const item = itemById.get(r.item); return rarity(item.tier, label(item, r.qty)); }).join(', ');
}

export const label = (item, qty) => `${qty} ${item.emoji} ${item.name}`;

// "Gold Bar (100 g)" and "gold-bar" both become "goldbar".
const key = (text) => text.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

// The item a name means: an exact name first, else every name containing it
// (retired ones only if they're held). Several matches narrow to the ones
// actually held.
export function findItem(query, held = new Map()) {
  const q = key(query);
  if (!q) return { matches: [] };
  const exact = ITEMS.find((i) => key(i.name) === q || key(i.id) === q);
  if (exact) return { item: exact };
  const matches = ITEMS.filter((i) => key(i.name).includes(q) && (!i.retired || held.has(i.id)));
  const mine = matches.filter((i) => held.has(i.id));
  if (matches.length === 1) return { item: matches[0] };
  if (mine.length === 1) return { item: mine[0] };
  return { matches: mine.length ? mine : matches };
}

// What `args` asks for out of `rows`: { lots: [{ item, qty }] }, { error }
// or { usage } (an amount below 1). "all" means everything (or everything but legendaries when
// `allKeepsLegendaries`, reported as `keptLegendaries`). `where` finishes
// sentences like "You don't have any X" ("" or " in your safe"), `verb`
// is what can't be done to a retired item ("sold", "moved").
export function choose(args, rows, { allKeepsLegendaries = false, where = '', verb }) {
  const held = new Map(rows.map((r) => [r.item, r.qty]));
  const stacks = [...held].map(([id, qty]) => ({ item: itemById.get(id), qty })).filter((l) => l.item && !l.item.retired);

  if (args.length === 1 && args[0].toLowerCase() === 'all') {
    const lots = allKeepsLegendaries ? stacks.filter((l) => l.item.tier !== 'legendary') : stacks;
    return { lots, keptLegendaries: lots.length < stacks.length };
  }

  // A whole category (tier) at once, legendary included since it's asked for by name.
  const tier = args.length === 1 && args[0].toLowerCase();
  if (TIERS.has(tier)) {
    const lots = stacks.filter((l) => l.item.tier === tier);
    return lots.length ? { lots } : { error: `You don't have any ${tier} items${where}.` };
  }

  const last = args.at(-1).toLowerCase();
  const counted = args.length > 1 && (last === 'all' || /^\d+$/.test(last));
  const name = (counted ? args.slice(0, -1) : args).join(' ');
  const { item, matches } = findItem(name, held);
  if (!item) {
    if (!matches.length) return { error: `There's no item called **${name}**.` };
    return { error: `Which one? ${matches.map((i) => `${i.emoji} ${i.name}`).join(', ')}` };
  }
  if (item.retired) return { error: `${item.emoji} **${item.name}** can't be ${verb}.` };

  const have = held.get(item.id) ?? 0;
  const qty = !counted ? 1 : last === 'all' ? have : Number(last);
  if (!have) return { error: `You don't have any ${item.emoji} **${item.name}**${where}.` };
  if (qty < 1) return { usage: true };
  if (qty > have) return { error: `You only have ${label(item, have)}${where}.` };
  return { lots: [{ item, qty }] };
}

// As many of `lots` as fit in `room` spaces, most valuable first. Returns
// { fits, left } (left = how many items didn't fit).
export function fit(lots, room) {
  const fits = [];
  let left = 0;
  for (const lot of [...lots].sort((a, b) => b.item.price - a.item.price)) {
    const qty = Math.max(0, Math.min(lot.qty, room));
    if (qty) fits.push({ item: lot.item, qty });
    room -= qty;
    left += lot.qty - qty;
  }
  return { fits, left };
}

// "3 🐟 Salmon" for one stack, else "12 items".
export const describe = (lots) => (lots.length === 1 ? label(lots[0].item, lots[0].qty) : `${lots.reduce((n, l) => n + l.qty, 0)} items`);
