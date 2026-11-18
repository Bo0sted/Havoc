import { randomInt } from 'node:crypto';
import sharp from 'sharp';
import { fetchOk, getJson } from '../web.js';

const API = 'https://pokeapi.co/api/v2';
const KEEP = 100;
const STATS = { hp: 'HP', attack: 'Atk', defense: 'Def', 'special-attack': 'SpA', 'special-defense': 'SpD', speed: 'Spe' };

// PokeAPI's fair-use policy asks for caching: each Pokémon (its card and
// picture) is fetched once and kept, oldest dropped past KEEP.
const cache = new Map();
let total = null; // how many Pokémon there are, for random picks

const title = (name) => name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

async function load(query) {
  if (cache.has(query)) return cache.get(query);
  const p = await getJson(`${API}/pokemon/${query}`);
  const art = p.sprites.other?.['official-artwork']?.front_default ?? p.sprites.front_default;
  const picture = art
    ? await sharp(Buffer.from(await (await fetchOk(art)).arrayBuffer())).resize(256, 256, { fit: 'inside' }).png().toBuffer()
    : null;
  const card = [
    `🔴 **${title(p.name)}** #${p.id} · ${p.types.map((t) => title(t.type.name)).join(' / ')}`,
    `Height ${(p.height / 10).toFixed(1)} m · Weight ${(p.weight / 10).toFixed(1)} kg`,
    p.stats.map((s) => `${STATS[s.stat.name] ?? s.stat.name} ${s.base_stat}`).join(' · '),
  ].join('\n');
  const entry = { card, picture };
  for (const key of new Set([query, p.name, String(p.id)])) cache.set(key, entry);
  while (cache.size > KEEP * 2) cache.delete(cache.keys().next().value);
  return entry;
}

export default {
  name: 'pokemon',
  category: 'fun',
  usage: '[name|number]',
  description: 'look up a Pokémon, or get a random one',
  cooldown: 5_000,
  rateLimit: { max: 30, per: 60_000 }, // no published limit: a courtesy cap
  cooldownText: (wait) => `🔴 Your Pokédex is recharging. Try again in ${wait}.`,
  async run({ args, reply, replyImage }) {
    let query = args.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^0+(?=\d)/, '');
    if (!query) {
      total ??= (await getJson(`${API}/pokemon-species?limit=1`)).count;
      query = String(randomInt(1, total + 1));
    }
    let entry;
    try {
      entry = await load(query);
    } catch (err) {
      if (err.status === 404) return reply(`I can't find a Pokémon called **${args.join(' ')}**.`);
      throw err;
    }
    await reply(entry.card);
    if (entry.picture) await replyImage(entry.picture, 'pokemon.png', 'image/png');
  },
};
