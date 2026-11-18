// Forgiving answers for games that wait on a reply: case, spaces, edge
// punctuation and a stray trailing "s" don't matter, and a typo counts if
// it's clearly closest to one option (about 1 mistake per 3 letters).
// Anything else (ordinary chat) isn't an answer at all.

const clean = (text) => text.toLowerCase().trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

// Typos between two words: a missing, extra or wrong letter, or two letters
// swapped, each count as one.
function typos(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// The option an answer means, or null. `aliases` maps extra spellings
// (e.g. "h" → "heads", "three" → "3") to options.
export function matchAnswer(text, options, aliases = {}) {
  const word = clean(text);
  if (!word) return null;
  for (const w of [word, word.replace(/s$/, '')]) {
    if (options.includes(w)) return w;
    if (Object.hasOwn(aliases, w)) return aliases[w];
  }
  if (/^\d+$/.test(word)) return null; // numbers must be exact: 10 isn't a typo of 1
  // Typos are checked against the options and any alias long enough to
  // misspell ("thre" → "three" → 3), and the closest has to be one option.
  const spellings = [...options.map((o) => [o, o]), ...Object.entries(aliases).filter(([a]) => a.length >= 3)];
  const scored = spellings.map(([spelt, option]) => ({ option, spelt, n: typos(word, spelt) })).sort((a, b) => a.n - b.n);
  const best = scored[0];
  const rival = scored.find((s) => s.option !== best.option);
  const close = best.n <= Math.max(1, Math.floor(best.spelt.length / 3));
  return close && (!rival || rival.n > best.n) ? best.option : null;
}

// "Options: `rock` `paper` `scissors`"
export const optionsLine = (options) => `Options: ${options.map((o) => `\`${o}\``).join(' ')}`;
