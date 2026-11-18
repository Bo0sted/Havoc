// Everything that can end up in a Safety Deposit Box: fishing catches,
// mining finds and broken tools. `price` is what it sells for in cents:
// roughly what it fetches in the US today, trash is junk shop money, and
// every item is worth more than every item in the tier below (broken tools
// sit outside that ladder in their own tier). Ids are stored in the
// database, so never rename one. `retired` items can't be caught or sold
// any more but stay in people's boxes.
import { TOOLS, KINDS } from './tools.js';

const FISH = [
  { id: 'old_boot', name: 'Old Boot', emoji: '🥾', tier: 'trash', price: 150 },
  { id: 'soggy_sock', name: 'Soggy Sock', emoji: '🧦', tier: 'trash', price: 75 },
  { id: 'tin_can', name: 'Tin Can', emoji: '🥫', tier: 'trash', price: 100 },
  { id: 'seaweed', name: 'Seaweed', emoji: '🌿', tier: 'trash', price: 50 },
  { id: 'car_keys', name: "Someone's Car Keys", emoji: '🔑', tier: 'trash', price: 200 },

  { id: 'common_fish', name: 'Common Fish', emoji: '🐟', tier: 'common', price: 400 },
  { id: 'sardine', name: 'Sardine', emoji: '🐟', tier: 'common', price: 350 },
  { id: 'anchovy', name: 'Anchovy', emoji: '🐟', tier: 'common', price: 300 },
  { id: 'minnow', name: 'Minnow', emoji: '🐟', tier: 'common', price: 250 },
  { id: 'tropical_fish', name: 'Tropical Fish', emoji: '🐠', tier: 'common', price: 1200 },
  { id: 'clownfish', name: 'Clownfish', emoji: '🐠', tier: 'common', price: 2500 },
  { id: 'trout', name: 'Trout', emoji: '🐟', tier: 'common', price: 1500 },
  { id: 'salmon', name: 'Salmon', emoji: '🐟', tier: 'common', price: 4000 },

  { id: 'pufferfish', name: 'Pufferfish', emoji: '🐡', tier: 'rare', price: 6000 },
  { id: 'swordfish', name: 'Swordfish', emoji: '🗡️', tier: 'rare', price: 40000 },
  { id: 'octopus', name: 'Octopus', emoji: '🐙', tier: 'rare', price: 7500 },
  { id: 'squid', name: 'Squid', emoji: '🦑', tier: 'rare', price: 4500 },

  { id: 'shark', name: 'Shark', emoji: '🦈', tier: 'epic', price: 75000 },
  { id: 'giant_squid', name: 'Giant Squid', emoji: '🦑', tier: 'epic', price: 500000 },
  { id: 'electric_eel', name: 'Electric Eel', emoji: '⚡', tier: 'epic', price: 50000 },

  { id: 'gold_bar', name: 'Gold Bar (100 g)', emoji: '🥇', tier: 'legendary', price: 1200000 },
  { id: 'silver_bar', name: 'Silver Bar (5 kg)', emoji: '🥈', tier: 'legendary', price: 750000 },
  { id: 'diamond', name: 'Diamond (2 carat)', emoji: '💎', tier: 'legendary', price: 1500000 },
  { id: 'natural_pearl', name: 'Natural Pearl', emoji: '🦪', tier: 'legendary', price: 1000000 },
  { id: 'gold_doubloon', name: 'Spanish Gold Doubloon', emoji: '🪙', tier: 'legendary', price: 1500000 },
  { id: 'ambergris', name: 'Ambergris (1 kg)', emoji: '🐋', tier: 'legendary', price: 1700000 },
  { id: 'rolex', name: 'Rolex', emoji: '⌚', tier: 'legendary', price: 1200000 },

  { id: 'kraken', name: 'Kraken', emoji: '🐙', tier: 'legendary', price: 100000000, retired: true },
  { id: 'golden_fish', name: 'Golden Fish', emoji: '🌟', tier: 'legendary', price: 10000000, retired: true },
  { id: 'leviathan', name: 'Leviathan', emoji: '🐋', tier: 'legendary', price: 250000000, retired: true },
  { id: 'dragon', name: 'Literally a Dragon', emoji: '🐉', tier: 'legendary', price: 1000000000, retired: true },
];

const MINE = [
  { id: 'pebble', name: 'Pebble', emoji: '🪨', tier: 'trash', price: 50 },
  { id: 'dirt_clump', name: 'Dirt Clump', emoji: '🟫', tier: 'trash', price: 75 },
  { id: 'rusty_nail', name: 'Rusty Nail', emoji: '🔩', tier: 'trash', price: 100 },
  { id: 'old_lunchbox', name: 'Old Lunchbox', emoji: '🍱', tier: 'trash', price: 150 },
  { id: 'lost_hard_hat', name: 'Lost Hard Hat', emoji: '⛑️', tier: 'trash', price: 200 },

  { id: 'coal', name: 'Coal', emoji: '⚫', tier: 'common', price: 250 },
  { id: 'iron_ore', name: 'Iron Ore', emoji: '⚙️', tier: 'common', price: 300 },
  { id: 'lead_ore', name: 'Lead Ore', emoji: '🔘', tier: 'common', price: 350 },
  { id: 'tin_ore', name: 'Tin Ore', emoji: '⚪', tier: 'common', price: 400 },
  { id: 'copper_ore', name: 'Copper Ore', emoji: '🟠', tier: 'common', price: 600 },
  { id: 'quartz_crystal', name: 'Quartz Crystal', emoji: '🔮', tier: 'common', price: 1000 },
  { id: 'pyrite', name: "Pyrite (Fool's Gold)", emoji: '🟡', tier: 'common', price: 1500 },
  { id: 'obsidian', name: 'Obsidian', emoji: '🖤', tier: 'common', price: 2500 },

  { id: 'silver_ore', name: 'Silver Ore', emoji: '🩶', tier: 'rare', price: 6000 },
  { id: 'amethyst', name: 'Amethyst', emoji: '🟣', tier: 'rare', price: 9000 },
  { id: 'garnet', name: 'Garnet', emoji: '❤️', tier: 'rare', price: 15000 },
  { id: 'opal', name: 'Opal', emoji: '🌈', tier: 'rare', price: 35000 },

  { id: 'gold_nugget', name: 'Gold Nugget', emoji: '🟨', tier: 'epic', price: 120000 },
  { id: 'emerald', name: 'Emerald', emoji: '💚', tier: 'epic', price: 250000 },
  { id: 'sapphire', name: 'Sapphire', emoji: '💙', tier: 'epic', price: 300000 },
  { id: 'ruby', name: 'Ruby', emoji: '♦️', tier: 'epic', price: 450000 },

  { id: 'tanzanite', name: 'Tanzanite', emoji: '💜', tier: 'legendary', price: 800000 },
  { id: 'rough_diamond', name: 'Rough Diamond', emoji: '💎', tier: 'legendary', price: 1000000 },
  { id: 'meteorite_fragment', name: 'Meteorite Fragment', emoji: '☄️', tier: 'legendary', price: 1200000 },
  { id: 'painite', name: 'Painite', emoji: '🟤', tier: 'legendary', price: 1700000 },
];

// A broken tool sells for 10% of what it cost.
const BROKEN = TOOLS.map((t) => ({
  id: `broken_${t.id}`, name: `Broken ${t.name}`, emoji: KINDS[t.kind].emoji, tier: 'broken', price: Math.round(t.price / 10),
}));

export const ITEMS = [
  ...FISH.map((i) => ({ ...i, from: 'fish' })),
  ...MINE.map((i) => ({ ...i, from: 'mine' })),
  ...BROKEN,
];

export const itemById = new Map(ITEMS.map((i) => [i.id, i]));

// What a stack of an item is worth in cents. Retired (and unknown) items
// can't be sold, so they're worth nothing.
export function valueOf(id, qty) {
  const item = itemById.get(id);
  return item && !item.retired ? item.price * qty : 0;
}

export const formatMoney = (cents) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
