// Reads the servers Havoc connects to from SERVERS in .env: a JSON list of
//   { "name": "...", "url": "...", "username": "...", "password": "...", "admins": [1, 7] }
// Each server needs a unique name (it's how ?remote picks a server and how
// its data is kept apart). A bad entry is skipped with the reason logged;
// the rest still connect.

function skip(entry, reason) {
  const name = typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : '(no name)';
  const url = typeof entry?.url === 'string' && entry.url.trim() ? entry.url.trim() : '(no url)';
  console.warn(`Skipping server ${name} at ${url}: ${reason}`);
}

function problem(entry) {
  if (!entry || typeof entry !== 'object') return 'entry is not an object';
  if (typeof entry.name !== 'string' || !entry.name.trim()) return 'it has no name';
  if (/\s/.test(entry.name.trim())) return 'its name has spaces (it must be one word for ?remote)';
  try {
    if (!/^https?:$/.test(new URL(entry.url).protocol)) return 'its url is not http(s)';
  } catch {
    return 'its url is missing or invalid';
  }
  if (typeof entry.username !== 'string' || !entry.username) return 'it has no username';
  if (typeof entry.password !== 'string' || !entry.password) return 'it has no password';
  const admins = entry.admins ?? [];
  if (!Array.isArray(admins) || !admins.every((id) => Number.isInteger(id) && id > 0)) {
    return 'admins must be a list of user ids (whole numbers)';
  }
  return null;
}

export function loadServers(raw = process.env.SERVERS) {
  if (!raw) throw new Error('SERVERS is not set in .env (see .env.example).');
  let list;
  try {
    list = JSON.parse(raw);
  } catch (err) {
    throw new Error(`SERVERS in .env is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(list)) throw new Error('SERVERS in .env must be a JSON list.');

  const valid = list.filter((entry) => {
    const why = problem(entry);
    if (why) skip(entry, why);
    return !why;
  });

  // A shared name is ambiguous, so every server using it is skipped.
  const counts = new Map();
  for (const s of valid) counts.set(s.name.trim().toLowerCase(), (counts.get(s.name.trim().toLowerCase()) ?? 0) + 1);

  return valid
    .filter((s) => {
      const dup = counts.get(s.name.trim().toLowerCase()) > 1;
      if (dup) skip(s, 'another server uses the same name');
      return !dup;
    })
    .map((s) => ({
      name: s.name.trim(),
      key: s.name.trim().toLowerCase(),
      url: s.url.trim(),
      username: s.username,
      password: s.password,
      admins: new Set(s.admins ?? []),
    }));
}
