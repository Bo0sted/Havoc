// Everything ?shop sells except recovery items: tools (one of each kind per
// person), ammo and licenses, plus the promos that give tools away.
// Poles and pickaxes are safe for `guaranteed` uses; after that each use has
// a `breakChance`% chance of breaking it, and the use after `max` always
// does. Guns, safes and crew outfits never break. Within a kind, later tools
// are better: upgrading means buying one further down the list (downgrading
// isn't allowed). Ids are stored in the database, so never rename one. Poles
// last about twice as many uses as pickaxes of the same tier: a cast costs
// half a swing's energy, so fishing goes through them faster.
import { matchAnswer } from './answers.js';

export const KINDS = {
  pole: { noun: 'fishing pole', unit: 'casts', emoji: '🎣' },
  pickaxe: { noun: 'pickaxe', unit: 'swings', emoji: '⛏️' },
  gun: { noun: 'gun', unit: 'rounds', emoji: '🔫' },
  safe: { noun: 'safe', emoji: '🔒' },
  boat: { noun: 'boat', emoji: '🚤' },
  mine_site: { noun: 'mine', emoji: '🏗️' },
  land: { noun: 'hunting land', emoji: '🏕️' },
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

  // Guns fire one round of their `ammo` per hunt. `big` guns can hunt big
  // game, where `hospital` is the % chance of ending up there (bigger guns
  // keep you further from the animal). What a better gun saves on the
  // hospital becomes common game; the other finds are the same with every gun.
  { id: 'marlin_60', kind: 'gun', name: 'Marlin Model 60', price: 250_000, ammo: 'ammo_22lr', big: false },
  { id: 'mossberg_500', kind: 'gun', name: 'Mossberg 500', price: 1_000_000, ammo: 'ammo_12ga', big: true, hospital: 10 },
  { id: 'remington_700', kind: 'gun', name: 'Remington 700', price: 2_500_000, ammo: 'ammo_308', big: true, hospital: 6 },
  { id: 'barrett_50', kind: 'gun', name: 'Barrett .50 Cal', price: 7_500_000, ammo: 'ammo_50bmg', big: true, hospital: 4 },

  // Safes only differ in how many items they hold. Bigger ones cost more per
  // space, so keeping a few valuables is cheap and hoarding isn't.
  { id: 'sentry_safe', kind: 'safe', name: 'SentrySafe', price: 500_000, space: 50 },
  { id: 'liberty_safe', kind: 'safe', name: 'Liberty Safe', price: 2_500_000, space: 150 },
  { id: 'fort_knox_safe', kind: 'safe', name: 'Fort Knox Safe', price: 10_000_000, space: 400 },
  { id: 'swiss_bank_vault', kind: 'safe', name: 'Swiss Bank Vault', price: 40_000_000, space: 1_000 },

  // Crew outfits (crew.js), one kind per job: how many crew it has room for
  // (2 with none), and a perk that adds to the ones before it.
  { id: 'jon_boat', kind: 'boat', name: 'Jon Boat', price: 5_000_000, crew: 4 },
  { id: 'bass_boat', kind: 'boat', name: 'Bass Boat', price: 25_000_000, crew: 6, perk: 'a fish finder: no empty casts' },
  { id: 'offshore_boat', kind: 'boat', name: 'Offshore Boat', price: 125_000_000, crew: 10, perk: 'better rare and epic odds' },
  { id: 'sportfishing_yacht', kind: 'boat', name: 'Sportfishing Yacht', price: 625_000_000, crew: Infinity, perk: 'better legendary odds' },
  { id: 'mining_claim', kind: 'mine_site', name: 'Mining Claim', price: 5_000_000, crew: 4 },
  { id: 'quarry', kind: 'mine_site', name: 'Quarry', price: 25_000_000, crew: 6, perk: 'pickaxes last twice as long' },
  { id: 'open_pit_mine', kind: 'mine_site', name: 'Open-Pit Mine', price: 125_000_000, crew: 10, perk: 'better rare and epic odds' },
  { id: 'mining_company', kind: 'mine_site', name: 'Mining Company', price: 625_000_000, crew: Infinity, perk: 'better legendary odds' },
  { id: 'hunting_lease', kind: 'land', name: 'Hunting Lease', price: 5_000_000, crew: 4 },
  { id: 'hunting_lodge', kind: 'land', name: 'Hunting Lodge', price: 25_000_000, crew: 6, perk: 'hurt crew heal twice as fast' },
  { id: 'private_ranch', kind: 'land', name: 'Private Ranch', price: 125_000_000, crew: 10, perk: 'better rare and epic odds' },
  { id: 'game_reserve', kind: 'land', name: 'Game Reserve', price: 625_000_000, crew: Infinity, perk: 'better legendary odds' },
];

// Sold by the box; each fits one gun. $5-50 a round, small next to the
// ~$1,060 a big-game hunt brings in on average.
export const AMMO = [
  { id: 'ammo_22lr', name: '.22 LR Ammo', price: 25_000, rounds: 50 },
  { id: 'ammo_12ga', name: '12 Gauge Shells', price: 50_000, rounds: 50 },
  { id: 'ammo_308', name: '.308 Win Ammo', price: 100_000, rounds: 50 },
  { id: 'ammo_50bmg', name: '.50 BMG Ammo', price: 250_000, rounds: 50 },
];

// Bought once, kept for good, never sold. `crew` ones are listed with the
// crew outfits in ?shop.
export const LICENSES = [
  { id: 'gun_license', name: 'Gun License', price: 50_000, needed: 'to buy a gun' },
  { id: 'hunting_license', name: 'Hunting License', price: 100_000, needed: 'to hunt' },
  { id: 'workers_comp', name: "Workers' Comp Insurance", price: 250_000, needed: 'to hire crew', crew: true },
];

export const ammoById = new Map(AMMO.map((a) => [a.id, a]));
export const licenseById = new Map(LICENSES.map((l) => [l.id, l]));

export const toolById = new Map(TOOLS.map((t) => [t.id, t]));

// Crew outfits (a boat, mine site or hunting land) are property: they can't
// be sold, but count at their shop price in net worth, ?top and ?gdp.
export function propertyValue(id) {
  const tool = toolById.get(id);
  return tool?.crew ? tool.price : 0;
}

// "1 cast used", "6 swings used".
export const wear = (kind, uses) => `${uses} ${uses === 1 ? KINDS[kind].unit.slice(0, -1) : KINDS[kind].unit} used`;

// Poles and pickaxes wear out; guns and safes don't.
export const breakable = (tool) => tool.max !== undefined;

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
