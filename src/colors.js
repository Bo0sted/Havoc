// Haven's coloured text (c#RRGGBB…#c, Haven 4.7.0+): money coming in is
// green, money going out red, and in ?shop what you already own is green.
// Everything else keeps the reader's normal text colour. Both shades read
// well on light and dark themes.
import { formatMoney } from './items.js';

const paint = (hex) => (text) => `c#${hex}${text}#c`;
export const green = paint('22c55e');
export const red = paint('ef4444');

// "$12.00" in green (earned) or red (spent / lost).
export const gained = (cents) => green(formatMoney(cents));
export const lost = (cents) => red(formatMoney(cents));
