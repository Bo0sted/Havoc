// Fetching from public APIs: one User-Agent (some ask for it), a timeout so
// a slow API can't hang a command, and any non-OK answer as an error.
const HEADERS = { 'User-Agent': 'Havoc (https://github.com/Bo0sted/Havoc)', Accept: 'application/json' };

export async function fetchOk(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw Object.assign(new Error(`${url} answered ${res.status}`), { status: res.status });
  return res;
}

export const getJson = async (url) => (await fetchOk(url)).json();
