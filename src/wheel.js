// The wheels for ?wheel (free and paid) and ?bet wheel: 20 equal slices each,
// so every slice is exactly 1 in 20 and what you see is the real odds.
// Slices are listed clockwise from the top. The art in assets/wheel is drawn
// from these by scripts/wheel-art.js: change a slice's emoji, label or
// colour (or their order) and run it again, or the GIF won't match.
// Money is in cents.
import { createHash } from 'node:crypto';

const C = {
  cash: '#ca8a04', good: '#16a34a', lucky: '#0d9488', misfortune: '#7c3aed', bad: '#dc2626', swing: '#2563eb',
  // The paid wheel is darker, with a gold jackpot.
  paidCash: '#a16207', paidGood: '#166534', paidLucky: '#115e59', paidMisfortune: '#4c1d95', paidBad: '#7f1d1d',
  paidSwing: '#1e3a8a', jackpot: '#eab308',
};

const MIN = 60_000;

export const WHEELS = {
  // Two free spins a day: mild, and pays a little on average.
  free: [
    { emoji: '🤑', label: '$10,000', color: C.cash, kind: 'cash', cents: 1_000_000 },
    { emoji: '🧾', label: 'IRS', color: C.bad, kind: 'irs', rate: 0.10, max: 200_000 },
    { emoji: '🍀', label: 'MILD', color: C.lucky, kind: 'charm', type: 'lucky', severity: 'mild' },
    { emoji: '💵', label: '$500', color: C.cash, kind: 'cash', cents: 50_000 },
    { emoji: '💀', label: 'MILD', color: C.misfortune, kind: 'charm', type: 'misfortune', severity: 'mild' },
    { emoji: '⚡', label: 'ENERGY', color: C.good, kind: 'surge' },
    { emoji: '🐍', label: 'SNAKE', color: C.bad, kind: 'snake', scale: 0.25 },
    { emoji: '🍀', label: 'STRONG', color: C.lucky, kind: 'charm', type: 'lucky', severity: 'strong' },
    { emoji: '💵', label: '$1,000', color: C.cash, kind: 'cash', cents: 100_000 },
    { emoji: '🚔', label: 'JAIL', color: C.bad, kind: 'jail', ms: 10 * MIN },
    { emoji: '🃏', label: 'WILD', color: C.swing, kind: 'wild', options: [
      { kind: 'cash', cents: 1_000_000, name: 'the $10,000 jackpot' },
      { kind: 'irs', rate: 0.10, max: 200_000, name: 'an IRS audit' },
      { kind: 'again', name: 'a free spin' },
    ] },
    { emoji: '🍀', label: 'MILD', color: C.lucky, kind: 'charm', type: 'lucky', severity: 'mild' },
    { emoji: '💎', label: 'EPIC', color: C.good, kind: 'items', tier: 'epic', count: 1 },
    { emoji: '💵', label: '$500', color: C.cash, kind: 'cash', cents: 50_000 },
    { emoji: '🍀', label: 'MILD', color: C.lucky, kind: 'charm', type: 'lucky', severity: 'mild' },
    { emoji: '🔄', label: 'AGAIN', color: C.good, kind: 'again' },
    { emoji: '🥷', label: 'THIEF', color: C.bad, kind: 'pickpocket' },
    { emoji: '💰', label: '$2,000', color: C.cash, kind: 'cash', cents: 200_000 },
    { emoji: '💀', label: 'STRONG', color: C.misfortune, kind: 'charm', type: 'misfortune', severity: 'strong' },
    { emoji: '🪙', label: 'FLIP', color: C.swing, kind: 'flip', cents: 100_000 },
  ],
  // Paid spins: high risk, high reward. The first one each day gives back
  // about what it costs; the doubling price makes the rest lose.
  paid: [
    { emoji: '🎰', label: '$40,000', color: C.jackpot, kind: 'cash', cents: 4_000_000 },
    { emoji: '💰', label: '$5,000', color: C.paidCash, kind: 'cash', cents: 500_000 },
    { emoji: '🍀', label: 'STRONG', color: C.paidLucky, kind: 'charm', type: 'lucky', severity: 'strong' },
    { emoji: '💰', label: '$5,000', color: C.paidCash, kind: 'cash', cents: 500_000 },
    { emoji: '💀', label: 'STRONG', color: C.paidMisfortune, kind: 'charm', type: 'misfortune', severity: 'strong' },
    { emoji: '🏆', label: 'LEGENDARY', color: C.paidGood, kind: 'items', tier: 'legendary', count: 1 },
    { emoji: '🧾', label: 'IRS', color: C.paidBad, kind: 'irs', rate: 0.25, max: 2_500_000 },
    { emoji: '🍀', label: 'INSANE', color: C.paidLucky, kind: 'charm', type: 'lucky', severity: 'insane' },
    { emoji: '🦹', label: 'ROBBED', color: C.paidBad, kind: 'robbed' },
    { emoji: '🤑', label: '$10,000', color: C.paidCash, kind: 'cash', cents: 1_000_000 },
    { emoji: '💀', label: 'SEVERE', color: C.paidMisfortune, kind: 'charm', type: 'misfortune', severity: 'severe' },
    { emoji: '🪙', label: 'DOUBLE', color: C.paidSwing, kind: 'flip', cents: 500_000 },
    { emoji: '💎', label: '2 EPICS', color: C.paidGood, kind: 'items', tier: 'epic', count: 2 },
    { emoji: '🏥', label: 'HOSPITAL', color: C.paidBad, kind: 'hospital' },
    { emoji: '🍀', label: 'STRONG', color: C.paidLucky, kind: 'charm', type: 'lucky', severity: 'strong' },
    { emoji: '💸', label: '-$5,000', color: C.paidBad, kind: 'lose', cents: 500_000 },
    { emoji: '💰', label: '$5,000', color: C.paidCash, kind: 'cash', cents: 500_000 },
    { emoji: '🍀', label: 'STRONG', color: C.paidLucky, kind: 'charm', type: 'lucky', severity: 'strong' },
    { emoji: '🏆', label: 'LEGENDARY', color: C.paidGood, kind: 'items', tier: 'legendary', count: 1 },
    { emoji: '🃏', label: 'WILD', color: C.paidSwing, kind: 'wild', options: [
      { kind: 'cash', cents: 1_000_000, name: '$10,000' },
      { kind: 'robbed', name: 'a robbery' },
      { kind: 'again', name: 'a free spin' },
    ] },
  ],
  // ?bet wheel: what the wager is multiplied by. Exactly fair: the 20
  // multipliers add up to 20, so on average you get your bet back. It wins
  // as often as it loses (8 slices each, 4 ties), so it feels fair too
  // (owner's call). Just the numbers, with an emoji only on the 4× jackpot.
  bet: [4, 0, 1.5, 1, 0.5, 1.5, 0, 1, 1.5, 0.5, 0, 1.5, 1, 1.5, 0, 0.5, 1.5, 1, 1.5, 0].map((x) => ({
    emoji: x === 4 ? '🎰' : null,
    label: `${x}×`,
    size: 22, // a bigger label: the number is all there is
    color: { 0: '#374151', 0.5: '#b45309', 1: '#2563eb', 1.5: '#16a34a', 4: '#eab308' }[x],
    kind: 'multiplier',
    times: x,
  })),
};

// On the prize wheels only the charm slices (whose labels just say how
// strong) and the jackpot show their emoji, with bigger labels elsewhere:
// owner's call, one on every slice was too much. Chat messages still use them all.
for (const name of ['free', 'paid']) {
  const jackpot = Math.max(...WHEELS[name].filter((s) => s.kind === 'cash').map((s) => s.cents));
  for (const s of WHEELS[name]) {
    if (s.kind === 'charm' || (s.kind === 'cash' && s.cents === jackpot)) continue;
    s.bare = true;
    s.size = 16;
  }
}

// What the art shows, as a fingerprint: the GIF code refuses art drawn from
// different slices than these.
export const artFingerprint = (slices) =>
  createHash('sha256').update(JSON.stringify(slices.map((s) => [s.emoji, s.label, s.color, s.size, !!s.bare]))).digest('hex').slice(0, 16);
