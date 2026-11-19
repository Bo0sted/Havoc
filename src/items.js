// Everything that can end up in a Backpack (or a safe): fishing catches,
// mining finds, hunting trophies and broken tools. `price` is what it sells for in cents:
// roughly what it fetches in the US today, trash is junk shop money, and
// every item is worth more than every item in the tier below (broken tools
// sit outside that ladder in their own tier). Ids are stored in the
// database, so never rename one. `retired` items can't be caught or sold
// any more but stay in people's Backpacks (taking no space there).
import { TOOLS, KINDS, breakable } from './tools.js';

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

// ?hunt small: no legendaries out here.
const HUNT_SMALL = [
  { id: 'squirrel', name: 'Squirrel', emoji: '🐿️', tier: 'common', price: 500 },
  { id: 'dove', name: 'Dove', emoji: '🕊️', tier: 'common', price: 800 },
  { id: 'rabbit', name: 'Rabbit', emoji: '🐇', tier: 'common', price: 1200 },
  { id: 'quail', name: 'Quail', emoji: '🐦', tier: 'common', price: 1500 },
  { id: 'duck', name: 'Duck', emoji: '🦆', tier: 'common', price: 2000 },
  { id: 'pheasant', name: 'Pheasant', emoji: '🐦', tier: 'common', price: 3000 },

  { id: 'raccoon_pelt', name: 'Raccoon Pelt', emoji: '🦝', tier: 'rare', price: 6000 },
  { id: 'wild_turkey', name: 'Wild Turkey', emoji: '🦃', tier: 'rare', price: 12000 },
  { id: 'canada_goose', name: 'Canada Goose', emoji: '🪿', tier: 'rare', price: 18000 },
  { id: 'red_fox_pelt', name: 'Red Fox Pelt', emoji: '🦊', tier: 'rare', price: 30000 },
  { id: 'bobcat_pelt', name: 'Bobcat Pelt', emoji: '🐈', tier: 'rare', price: 34000 },

  { id: 'albino_squirrel', name: 'Albino Squirrel', emoji: '🐿️', tier: 'epic', price: 150000 },
  { id: 'golden_pheasant', name: 'Golden Pheasant', emoji: '🦚', tier: 'epic', price: 250000 },
  { id: 'arctic_fox_pelt', name: 'Arctic Fox Pelt', emoji: '🦊', tier: 'epic', price: 350000 },
  { id: 'wolverine_pelt', name: 'Wolverine Pelt', emoji: '🦡', tier: 'epic', price: 450000 },
];

// ?hunt big: legendaries are trophies, which really do sell for this much.
const HUNT_BIG = [
  { id: 'venison_jerky', name: 'Venison Jerky', emoji: '🥩', tier: 'common', price: 1000 },
  { id: 'wild_boar_bacon', name: 'Wild Boar Bacon', emoji: '🥓', tier: 'common', price: 1200 },
  { id: 'deer_hide', name: 'Deer Hide', emoji: '🦌', tier: 'common', price: 1800 },
  { id: 'antler_shed', name: 'Antler Shed', emoji: '🦴', tier: 'common', price: 2000 },

  { id: 'wild_hog', name: 'Wild Hog', emoji: '🐗', tier: 'rare', price: 10000 },
  { id: 'whitetail_doe', name: 'Whitetail Doe', emoji: '🦌', tier: 'rare', price: 15000 },
  { id: 'pronghorn', name: 'Pronghorn', emoji: '🦌', tier: 'rare', price: 25000 },
  { id: 'mule_deer', name: 'Mule Deer', emoji: '🦌', tier: 'rare', price: 30000 },

  { id: 'eight_point_buck', name: '8-Point Buck', emoji: '🦌', tier: 'epic', price: 150000 },
  { id: 'black_bear', name: 'Black Bear', emoji: '🐻', tier: 'epic', price: 250000 },
  { id: 'bull_elk', name: 'Bull Elk', emoji: '🦌', tier: 'epic', price: 350000 },
  { id: 'mountain_lion', name: 'Mountain Lion', emoji: '🐆', tier: 'epic', price: 450000 },

  { id: 'grizzly_bear_hide', name: 'Grizzly Bear Hide', emoji: '🐻', tier: 'legendary', price: 1000000 },
  { id: 'bull_moose_mount', name: 'Bull Moose Mount', emoji: '🫎', tier: 'legendary', price: 1200000 },
  { id: 'bighorn_ram_mount', name: 'Bighorn Ram Mount', emoji: '🐏', tier: 'legendary', price: 1400000 },
  { id: 'record_whitetail_rack', name: 'Record Whitetail Rack', emoji: '🏆', tier: 'legendary', price: 1600000 },
];

// A broken tool sells for 10% of what it cost.
const BROKEN = TOOLS.filter(breakable).map((t) => ({
  id: `broken_${t.id}`, name: `Broken ${t.name}`, emoji: KINDS[t.kind].emoji, tier: 'broken', price: Math.round(t.price / 10),
}));

export const ITEMS = [
  ...FISH.map((i) => ({ ...i, from: 'fish' })),
  ...MINE.map((i) => ({ ...i, from: 'mine' })),
  ...HUNT_SMALL.map((i) => ({ ...i, from: 'hunt_small' })),
  ...HUNT_BIG.map((i) => ({ ...i, from: 'hunt_big' })),
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
