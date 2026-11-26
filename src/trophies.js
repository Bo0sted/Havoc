// Trophies: keepsakes from events (events.js), kept on someone's profile for
// good. Unlike items they can't be sold, given or moved, take no Backpack
// space and add nothing to net worth. Each has a picture in assets/trophies
// named after its id. Ids are stored, so never rename one.
import { readFile } from 'node:fs/promises';
import { yellow } from './colors.js';

const ART = new URL('../assets/trophies/', import.meta.url);

export const TROPHIES = [
  { id: 'golden_turkey', emoji: '🏆', name: 'Golden Turkey' },
];

export const trophyById = new Map(TROPHIES.map((t) => [t.id, t]));

// A trophy's name in gold, and its picture (a PNG).
export const trophyName = (trophy) => yellow(trophy.name);
export const trophyPicture = (trophy) => readFile(new URL(`${trophy.id}.png`, ART));

// Someone's trophies for ?stats, "🏆 Golden Turkey ×2" in list order, or ''.
export function trophyCase(rows) {
  const held = new Map(rows.map((r) => [r.trophy, r.qty]));
  return TROPHIES.filter((t) => held.get(t.id) > 0)
    .map((t) => `${t.emoji} ${trophyName(t)}${held.get(t.id) > 1 ? ` ×${held.get(t.id)}` : ''}`)
    .join(' · ');
}
