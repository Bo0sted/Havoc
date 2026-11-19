// Fishing poles and pickaxes sold in ?shop, and the promos that give them.
// A tool is safe for `guaranteed` uses; after that each use has a
// `breakChance`% chance of breaking it, and the use after `max` always does.
// Within a kind, later tools are better: upgrading means buying one further
// down the list (downgrading isn't allowed). Ids are stored in the database,
// so never rename one. Poles last about twice as many uses as pickaxes of
// the same tier: a cast costs a quarter of a swing's energy, so fishing
// goes through them much faster.
import { matchAnswer } from './answers.js';

export const KINDS = {
  pole: { noun: 'fishing pole', unit: 'casts', emoji: '🎣' },
  pickaxe: { noun: 'pickaxe', unit: 'swings', emoji: '⛏️' },
};

export const TOOLS = [
  { id: 'dollar_general_pole', kind: 'pole', name: 'Dollar General Fishing Pole', price: 2_500, max: 10, guaranteed: 3, breakChance: 20,
    breaks: 'Your Dollar General Fishing Pole snapped in half and you fell in the water. You get what you pay for.' },
  { id: 'walmart_pole', kind: 'pole', name: 'Walmart Fishing Pole', price: 5_000, max: 20, guaranteed: 9, breakChance: 10,
    breaks: "Your Walmart Fishing Pole broke and you fell in the water. Should've kept the receipt." },
  { id: 'dicks_pole', kind: 'pole', name: "Dick's Sporting Goods Fishing Pole", price: 10_000, max: 50, guaranteed: 26, breakChance: 7,
    breaks: "Your Dick's Sporting Goods Fishing Pole finally gave out and you fell in the water." },
  { id: 'bass_pro_pole', kind: 'pole', name: 'Bass Pro Shops Fishing Pole', price: 20_000, max: 100, guaranteed: 62, breakChance: 3,
    breaks: 'Your Bass Pro Shops Fishing Pole broke after a long, proud career. You fell in the water anyway.' },

  { id: 'harbor_freight_pickaxe', kind: 'pickaxe', name: 'Harbor Freight Pickaxe', price: 10_000, max: 15, guaranteed: 5, breakChance: 15,
    breaks: 'Your Harbor Freight Pickaxe shattered on the first real rock. Classic.' },
  { id: 'home_depot_pickaxe', kind: 'pickaxe', name: 'Home Depot Pickaxe', price: 20_000, max: 30, guaranteed: 15, breakChance: 10,
    breaks: "The head flew off your Home Depot Pickaxe. You're holding a stick now." },
  { id: 'snap_on_pickaxe', kind: 'pickaxe', name: 'Snap-on Pickaxe', price: 30_000, max: 55, guaranteed: 35, breakChance: 5,
    breaks: 'Your Snap-on Pickaxe broke. A Snap-on truck is already on its way to sell you another.' },
];

export const toolById = new Map(TOOLS.map((t) => [t.id, t]));

// "1 cast used", "6 swings used".
export const wear = (kind, uses) => `${uses} ${uses === 1 ? KINDS[kind].unit.slice(0, -1) : KINDS[kind].unit} used`;

// How good a tool is within its kind (0 = the cheapest).
export const rankOf = (tool) => TOOLS.filter((t) => t.kind === tool.kind).indexOf(tool);

// Each promo is claimable once per person per server.
export const PROMOS = [
  { id: 'welcome', label: 'Welcome gift: a free Dollar General Fishing Pole', tool: 'dollar_general_pole', message: "Don't expect much." },
];

const key = (text) => text.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const squash = (text) => key(text).replace(/ /g, '');

// The tools (or other shop items, from `list`) a typed name could mean
// ("walmart fishing pole", "walmart", "dicks fishing pole", "bass pro shop
// pole"): the full name, else every name containing all the typed words,
// else one near-miss spelling. More than one result means the name was ambiguous.
export function matchTools(text, list = TOOLS) {
  const words = key(text).split(' ').filter(Boolean);
  if (!words.length) return [];
  const exact = list.find((t) => squash(t.name) === words.join(''));
  if (exact) return [exact];
  const containing = list.filter((t) => words.every((w) => squash(t.name).includes(w)));
  if (containing.length) return containing;
  const typo = matchAnswer(words.join(''), list.map((t) => squash(t.name)));
  return typo ? [list.find((t) => squash(t.name) === typo)] : [];
}

// The one tool a name means, or null if none or ambiguous.
export function findTool(text) {
  const found = matchTools(text);
  return found.length === 1 ? found[0] : null;
}
