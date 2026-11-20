// Haven's coloured text (c#RRGGBB…#c, Haven 4.7.0+): money coming in is
// green, money going out red, and in ?shop what you already own is green.
// Epic items are blue and legendaries purple wherever they're listed, and
// charms take their severity's colour. Everything else keeps the reader's
// normal text colour. Every shade reads well on light and dark themes.
import { formatMoney } from './items.js';

const paint = (hex) => (text) => `c#${hex}${text}#c`;
export const green = paint('22c55e');
export const red = paint('ef4444');
export const blue = paint('3b82f6');
export const purple = paint('a855f7');
export const yellow = paint('eab308');
export const orange = paint('f97316');

// An item's name in its rarity's colour (epic blue, legendary purple).
export const RARITY = { epic: blue, legendary: purple };
export const rarity = (tier, text) => (RARITY[tier] ?? String)(text);
export const RARITY_KEY = '🟣 Legendary · 🔵 Epic';

// "$12.00" in green (earned) or red (spent / lost).
export const gained = (cents) => green(formatMoney(cents));
export const lost = (cents) => red(formatMoney(cents));
