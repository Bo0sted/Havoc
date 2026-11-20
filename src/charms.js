// Lucky and misfortune charms, won on ?wheel and kept in the Pocket (no
// limit). They can't be sold, given or moved. Each fires on its own kind of
// command (`on`), and only one fires per command: Havoc picks at random among
// the ones that fit, good and bad alike, so nobody controls which. A charm
// with `charges` lasts that many commands. Ids are stored, so never rename one.
import { randomInt } from 'node:crypto';
import { green, blue, purple, yellow, orange, red } from './colors.js';

// Bet charms only fire on a bet this big, so a cheap bet can't burn a curse,
// and the good ones are capped, so an all-in bet can't turn them into a fortune.
export const BET_CHARM_MIN = 100_000; // $1,000
export const BET_CHARM_CAP = 1_000_000; // $10,000

export const TYPES = {
  lucky: { label: 'Lucky charm', emoji: '🍀' },
  misfortune: { label: 'Misfortune charm', emoji: '💀' },
};

export const SEVERITIES = {
  lucky: { mild: ['Mild', green, '🟢'], strong: ['Strong', blue, '🔵'], insane: ['Insane', purple, '🟣'] },
  misfortune: { mild: ['Mild', yellow, '🟡'], strong: ['Strong', orange, '🟠'], severe: ['Severe', red, '🔴'] },
};

// on: gather (fish, mine, hunt), hunt, break (a pole or pickaxe about to
// break), tool (a pole or pickaxe), bet or sell.
export const CHARMS = [
  { id: 'second_wind', type: 'lucky', severity: 'mild', emoji: '🔋', name: 'Second Wind', on: 'gather',
    text: 'Your next fish, mine or hunt costs no energy.' },
  { id: 'lucky_horseshoe', type: 'lucky', severity: 'mild', emoji: '🐴', name: 'Lucky Horseshoe', on: 'hunt',
    text: "Your next hunt can't send you to the hospital." },
  { id: 'lucky_break', type: 'lucky', severity: 'mild', emoji: '🪵', name: 'Lucky Break', on: 'break',
    text: "The next time your pole or pickaxe would break, it doesn't." },
  { id: 'rabbits_foot', type: 'lucky', severity: 'strong', emoji: '🐇', name: "Rabbit's Foot", on: 'gather',
    text: 'Your next fish, mine or hunt is guaranteed epic.' },
  { id: 'lodestone', type: 'lucky', severity: 'strong', emoji: '🧲', name: 'Lodestone', on: 'gather',
    text: 'Your next fish, mine or hunt catches two items of different rarities (it waits until your Backpack has room for both).' },
  { id: 'loaded_dice', type: 'lucky', severity: 'strong', emoji: '🎲', name: 'Loaded Dice', on: 'bet', longShot: true,
    text: 'If you win your next bet of $1,000 or more on a game with 1-in-3 odds or worse (rps, dice, wheel), the payout is doubled (up to $10,000 extra).' },
  { id: 'four_leaf_clover', type: 'lucky', severity: 'strong', emoji: '🍀', name: 'Four-Leaf Clover', on: 'gather', charges: 2,
    text: 'Your next two fish, mine or hunt are guaranteed epic.' },
  { id: 'guardian_angel', type: 'lucky', severity: 'strong', emoji: '👼', name: 'Guardian Angel', on: 'bet',
    text: "If you lose money on your next bet of $1,000 or more (a timeout penalty too), it's refunded (up to $10,000)." },
  { id: 'midas_touch', type: 'lucky', severity: 'insane', emoji: '👑', name: 'Midas Touch', on: 'sell',
    text: 'The next time you sell, one unit of the most valuable item in that sale sells for double. Pick carefully: it works on whatever you sell next, even a Rusty Nail.' },
  { id: 'pot_of_gold', type: 'lucky', severity: 'insane', emoji: '🌈', name: 'Pot of Gold', on: 'gather', legendary: true,
    text: 'Your next fish, mine or big-game hunt is guaranteed legendary.' },

  { id: 'black_cat', type: 'misfortune', severity: 'mild', emoji: '🐈‍⬛', name: 'Black Cat', on: 'gather',
    text: 'Your next fish, mine or hunt catches nothing.' },
  { id: 'raccoons_curse', type: 'misfortune', severity: 'mild', emoji: '🦝', name: "Raccoon's Curse", on: 'gather',
    text: 'Your next fish, mine or hunt catches the lowest rarity there is (trash, or common when hunting).' },
  { id: 'sisyphus_stone', type: 'misfortune', severity: 'mild', emoji: '🪨', name: 'Sisyphus Stone', on: 'gather',
    text: 'Your next fish, mine or hunt costs double energy (or all you have left).' },
  { id: 'broken_mirror', type: 'misfortune', severity: 'strong', emoji: '🪞', name: 'Broken Mirror', on: 'tool',
    text: 'Your pole or pickaxe breaks on your next fish or mine.' },
  { id: 'spilled_salt', type: 'misfortune', severity: 'strong', emoji: '🧂', name: 'Spilled Salt', on: 'bet',
    text: 'If you win your next bet of $1,000 or more, you only get your wager back.' },
  { id: 'indoor_umbrella', type: 'misfortune', severity: 'strong', emoji: '☂️', name: 'Indoor Umbrella', on: 'bet',
    text: 'If you win your next bet of $1,000 or more, you only get half the winnings.' },
  { id: 'haunted_pawn_ticket', type: 'misfortune', severity: 'strong', emoji: '👻', name: 'Haunted Pawn Ticket', on: 'sell', valuable: true,
    text: 'The next time you sell an epic or legendary, one unit of the most valuable item in that sale sells for half.' },
  { id: 'voodoo_doll', type: 'misfortune', severity: 'severe', emoji: '🪆', name: 'Voodoo Doll', on: 'gather', charges: 2,
    text: 'Your next two fish, mine or hunt catch nothing.' },
  { id: 'friday_the_13th', type: 'misfortune', severity: 'severe', emoji: '📅', name: 'Friday the 13th', on: 'hunt',
    text: 'Your next hunt sends you to the hospital.' },
  { id: 'gamblers_curse', type: 'misfortune', severity: 'severe', emoji: '💀', name: "Gambler's Curse", on: 'bet',
    text: 'If you lose money on your next bet of $1,000 or more, you lose that much again (never into debt).' },
];

export const charmById = new Map(CHARMS.map((c) => [c.id, c]));

// Whether a charm can fire on this use:
//   { use: 'fish' | 'mine' | 'hunt_small' | 'hunt_big', breaking, room }
//   { use: 'bet', wager, chance }      { use: 'sell', valuable }
function fits(charm, use) {
  const gathering = ['fish', 'mine', 'hunt_small', 'hunt_big'].includes(use.use);
  const hunting = use.use.startsWith('hunt');
  // A tool that's breaking catches nothing, so only Lucky Break can matter.
  if (use.breaking) return charm.on === 'break';
  switch (charm.on) {
    case 'gather':
      if (!gathering) return false;
      if (charm.legendary && use.use === 'hunt_small') return false; // small game has no legendaries
      if (charm.id === 'lodestone' && use.room < 2) return false;
      return true;
    case 'hunt': return hunting;
    case 'tool': return gathering && !hunting; // guns never break
    case 'break': return false;
    case 'bet': return use.use === 'bet' && use.wager >= BET_CHARM_MIN && (!charm.longShot || use.chance <= 1 / 3);
    case 'sell': return use.use === 'sell' && (!charm.valuable || use.valuable);
    default: return false;
  }
}

// One charm from someone's Pocket that fits this use, picked at random, or
// null. It isn't used up until `use()` is called (once the command really
// happens).
export function drawCharm(db, server, userId, use) {
  const rows = db.pocket(server, userId).filter((r) => charmById.has(r.charm) && fits(charmById.get(r.charm), use));
  if (!rows.length) return null;
  const row = rows[randomInt(rows.length)];
  return { charm: charmById.get(row.charm), use: () => db.useCharm(row.id) };
}

export const givesCharm = (db, server, userId, charm) => db.addCharm(server, userId, charm.id, charm.charges ?? 1);

// A charm's name in its severity's colour.
export const charmName = (charm) => SEVERITIES[charm.type][charm.severity][1](charm.name);

// "🐇 Rabbit's Foot kicked in!", for the result of the command it fired on.
export const kickedIn = (charm) => `${charm.emoji} ${charmName(charm)} kicked in!`;

// The Pocket for ?stats: "Rabbit's Foot ×2, Black Cat, Four-Leaf Clover (1 use
// left)" in severity colours, lucky ones first, or "empty".
export function pocketContents(rows) {
  const order = new Map(CHARMS.map((c, i) => [c.id, i]));
  const groups = new Map();
  for (const r of rows) {
    if (!charmById.has(r.charm)) continue;
    const charm = charmById.get(r.charm);
    const partial = charm.charges && r.charges < charm.charges;
    const key = `${r.charm}\n${partial ? r.charges : ''}`;
    const g = groups.get(key) ?? { charm, n: 0, left: partial ? r.charges : null };
    g.n += 1;
    groups.set(key, g);
  }
  if (!groups.size) return 'empty';
  return [...groups.values()]
    .sort((a, b) => order.get(a.charm.id) - order.get(b.charm.id))
    .map(({ charm, n, left }) => {
      const uses = left ? ` (${left} use${left === 1 ? '' : 's'} left)` : '';
      return `${charm.emoji} ${charmName(charm)}${n > 1 ? ` ×${n}` : ''}${uses}`;
    })
    .join(', ');
}

// A charm by name, forgiving about case and punctuation; partial names work
// when they fit just one. Returns { charm } or { matches }.
const key = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
export function findCharm(text) {
  const q = key(text);
  if (!q) return { matches: [] };
  const exact = CHARMS.find((c) => key(c.name) === q);
  if (exact) return { charm: exact };
  const matches = CHARMS.filter((c) => key(c.name).includes(q));
  return matches.length === 1 ? { charm: matches[0] } : { matches };
}

// Charms of a type and severity, for the wheel's charm slices.
export const charmsOf = (type, severity) => CHARMS.filter((c) => c.type === type && c.severity === severity);
