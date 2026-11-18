// Haven refuses messages over 2000 characters; longer replies are split.
export const MAX_CHARS = 1900;

// Splits text into pieces under `max` at line breaks (blank lines kept),
// cutting a single over-long line only when it has to. Never gives an empty piece.
export function chunks(text, max = MAX_CHARS) {
  const out = [];
  let current = null;
  const flush = () => { if (current?.trim()) out.push(current); current = null; };
  for (const line of text.split('\n')) {
    for (let i = 0; i === 0 || i < line.length; i += max) {
      const part = line.slice(i, i + max);
      if (current !== null && current.length + 1 + part.length > max) flush();
      current = current === null ? part : `${current}\n${part}`;
    }
  }
  flush();
  return out;
}
