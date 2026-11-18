// Fishing poles and pickaxes sold in ?shop, and the promos that give them.
// A tool is safe for `guaranteed` uses; after that each use has a
// `breakChance`% chance of breaking it, and the use after `max` always does.
// Within a kind, later tools are better: upgrading means buying one further
// down the list (downgrading isn't allowed). Ids are stored in the database,
// so never rename one.
import { matchAnswer } from './answers.js';

export const KINDS = {
  pole: { noun: 'fishing pole', unit: 'casts', emoji: '🎣' },
  pickaxe: { noun: 'pickaxe', unit: 'swings', emoji: '⛏️' },
};

export const TOOLS = [
  { id: 'dollar_general_pole', kind: 'pole', name: 'Dollar General Fishing Pole', price: 2_500, max: 5, guaranteed: 1, breakChance: 25,
    breaks: 'Your Dollar General Fishing Pole snapped in half and you fell in the water. You get what you pay for.' },
  { id: 'walmart_pole', kind: 'pole', name: 'Walmart Fishing Pole', price: 5_000, max: 10, guaranteed: 4, breakChance: 15,
    breaks: "Your Walmart Fishing Pole broke and you fell in the water. Should've kept the receipt." },
  { id: 'dicks_pole', kind: 'pole', name: "Dick's Sporting Goods Fishing Pole", price: 10_000, max: 25, guaranteed: 12, breakChance: 10,
    breaks: "Your Dick's Sporting Goods Fishing Pole finally gave out and you fell in the water." },
  { id: 'bass_pro_pole', kind: 'pole', name: 'Bass Pro Shops Fishing Pole', price: 20_000, max: 50, guaranteed: 30, breakChance: 5,
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

// The tool a typed name means ("walmart fishing pole", "walmart", "dicks
// fishing pole", "bass pro shop pole"), or null: the full name, then a
// name containing every typed word, then a near-miss spelling.
export function findTool(text) {
  const words = key(text).split(' ').filter(Boolean);
  if (!words.length) return null;
  const exact = TOOLS.find((t) => squash(t.name) === words.join(''));
  if (exact) return exact;
  const containing = TOOLS.filter((t) => words.every((w) => squash(t.name).includes(w)));
  if (containing.length === 1) return containing[0];
  const typo = matchAnswer(words.join(''), TOOLS.map((t) => squash(t.name)));
  return typo ? TOOLS.find((t) => squash(t.name) === typo) : null;
}
