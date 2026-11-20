// Haven refuses messages over 2000 characters; longer replies are split.
export const MAX_CHARS = 1900;

// Splits text into pieces under `max` at line breaks (blank lines kept),
// cutting a single over-long line only when it has to. Never gives an empty piece.
// Given a list of sections (e.g. a category heading and its items), each
// stays whole in one piece, and is only split itself when it's over `max`.
export function chunks(text, max = MAX_CHARS) {
  if (Array.isArray(text)) return sections(text, max);
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

function sections(list, max) {
  const out = [];
  let current = null;
  for (const section of list) {
    if (current !== null && current.length + 1 + section.length <= max) {
      current = `${current}\n${section}`;
      continue;
    }
    if (current !== null) out.push(current);
    current = null;
    if (section.length <= max) current = section;
    else out.push(...chunks(section, max));
  }
  if (current?.trim()) out.push(current);
  return out;
}
