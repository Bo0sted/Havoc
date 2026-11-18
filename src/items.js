// Everything that can end up in a Safety Deposit Box. `price` is what it
// sells for in cents (roughly what the whole fish fetches in the US today;
// the legendaries are priced for fun), or null when it can't be sold.
// Ids are stored in the database, so never rename one.
export const ITEMS = [
  { id: 'old_boot', name: 'Old Boot', emoji: '🥾', tier: 'trash', price: null },
  { id: 'soggy_sock', name: 'Soggy Sock', emoji: '🧦', tier: 'trash', price: null },
  { id: 'tin_can', name: 'Tin Can', emoji: '🥫', tier: 'trash', price: null },
  { id: 'seaweed', name: 'Seaweed', emoji: '🌿', tier: 'trash', price: null },
  { id: 'car_keys', name: "Someone's Car Keys", emoji: '🔑', tier: 'trash', price: null },

  { id: 'common_fish', name: 'Common Fish', emoji: '🐟', tier: 'common', price: 400 },
  { id: 'sardine', name: 'Sardine', emoji: '🐟', tier: 'common', price: 150 },
  { id: 'anchovy', name: 'Anchovy', emoji: '🐟', tier: 'common', price: 50 },
  { id: 'minnow', name: 'Minnow', emoji: '🐟', tier: 'common', price: 25 },

  { id: 'tropical_fish', name: 'Tropical Fish', emoji: '🐠', tier: 'uncommon', price: 1200 },
  { id: 'clownfish', name: 'Clownfish', emoji: '🐠', tier: 'uncommon', price: 2500 },
  { id: 'trout', name: 'Trout', emoji: '🐟', tier: 'uncommon', price: 1500 },
  { id: 'salmon', name: 'Salmon', emoji: '🐟', tier: 'uncommon', price: 4000 },

  { id: 'pufferfish', name: 'Pufferfish', emoji: '🐡', tier: 'rare', price: 6000 },
  { id: 'swordfish', name: 'Swordfish', emoji: '🗡️', tier: 'rare', price: 40000 },
  { id: 'octopus', name: 'Octopus', emoji: '🐙', tier: 'rare', price: 3500 },
  { id: 'squid', name: 'Squid', emoji: '🦑', tier: 'rare', price: 1200 },

  { id: 'shark', name: 'Shark', emoji: '🦈', tier: 'epic', price: 75000 },
  { id: 'giant_squid', name: 'Giant Squid', emoji: '🦑', tier: 'epic', price: 500000 },
  { id: 'electric_eel', name: 'Electric Eel', emoji: '⚡', tier: 'epic', price: 25000 },

  { id: 'kraken', name: 'Kraken', emoji: '🐙', tier: 'legendary', price: 100000000 },
  { id: 'golden_fish', name: 'Golden Fish', emoji: '🌟', tier: 'legendary', price: 10000000 },
  { id: 'leviathan', name: 'Leviathan', emoji: '🐋', tier: 'legendary', price: 250000000 },
  { id: 'dragon', name: 'Literally a Dragon', emoji: '🐉', tier: 'legendary', price: 1000000000 },
];

export const itemById = new Map(ITEMS.map((i) => [i.id, i]));

export const formatMoney = (cents) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
