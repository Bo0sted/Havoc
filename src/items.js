// Everything that can end up in a Safety Deposit Box. `price` is what it
// sells for in cents: roughly what it fetches in the US today, trash is junk
// shop money, and legendaries are real valuables sized to beat every epic.
// Ids are stored in the database, so never rename one. `retired` items can't
// be caught or sold any more but stay in people's boxes.
export const ITEMS = [
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

export const itemById = new Map(ITEMS.map((i) => [i.id, i]));

// What a stack of an item is worth in cents. Retired (and unknown) items
// can't be sold, so they're worth nothing.
export function valueOf(id, qty) {
  const item = itemById.get(id);
  return item && !item.retired ? item.price * qty : 0;
}

export const formatMoney = (cents) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
