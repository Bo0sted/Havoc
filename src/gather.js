// ?fish and ?mine: spend energy and use your tool (which may break), then
// roll a tier by weight and an item within it (?hunt shares the rolling),
// and your crew come along (crew.js). Every job can land you in the
// hospital. Rolls use crypto.randomInt, the OS's secure random source, like every game.
import { randomInt } from 'node:crypto';
import { ITEMS } from './items.js';
import { KINDS, PROMOS, toolById } from './tools.js';
import { energyOf, spend, waitFor } from './energy.js';
import { formatWait } from './duration.js';
import { placeOf, safeOf } from './storage.js';
import { drawCharm, kickedIn } from './charms.js';
import { hospitalize, billLine } from './hospital.js';
import { partyFor, crewTrip } from './crew.js';

export const pick = (list) => list[randomInt(list.length)];
const LADDER = ['trash', 'common', 'rare', 'epic', 'legendary'];

// A random item of one tier from `from` (null if it has none).
function itemOf(from, tier) {
  const items = ITEMS.filter((i) => i.from === from && i.tier === tier && !i.retired);
  return items.length ? pick(items) : null;
}

// What a fish, mine or hunt brings in once a charm (or none) has had its say:
// a list of finds (items, or { tier: 'hospital' }), empty for a miss.
export function charmedCatch(charm, tiers, from) {
  const real = tiers.filter((t) => t.tier !== 'nothing' && t.tier !== 'hospital');
  switch (charm?.id) {
    case 'rabbits_foot':
    case 'four_leaf_clover': return [itemOf(from, 'epic')].filter(Boolean);
    case 'pot_of_gold': return [itemOf(from, 'legendary')].filter(Boolean);
    case 'black_cat':
    case 'voodoo_doll': return [];
    case 'raccoons_curse': return [itemOf(from, LADDER.find((tier) => real.some((t) => t.tier === tier)))].filter(Boolean);
    case 'lodestone': {
      // Two finds of different tiers, each rolled with the usual odds.
      const first = rollTier(real, from);
      const second = rollTier(real.filter((t) => t.tier !== first.tier), from);
      return [first, second].filter((f) => f?.id);
    }
    case 'lucky_horseshoe': return [rollTier(tiers.filter((t) => t.tier !== 'hospital'), from)].filter(Boolean);
    case 'friday_the_13th': return [{ tier: 'hospital' }];
    default: return [rollTier(tiers, from)].filter(Boolean);
  }
}

// The energy a fish, mine or hunt costs with this charm: none with Second
// Wind, double (or whatever's left) with Sisyphus Stone.
export function charmedCost(charm, cost, have) {
  if (charm?.id === 'second_wind') return 0;
  if (charm?.id === 'sisyphus_stone') return Math.min(cost * 2, have);
  return cost;
}

// A tier by weight ({ tier, weight } in `tiers`), then an item in it from
// `from`; null for 'nothing'. Other tiers ('hospital') come back as { tier }.
export function rollTier(tiers, from) {
  let n = randomInt(tiers.reduce((sum, t) => sum + t.weight, 0));
  const { tier } = tiers.find((t) => (n -= t.weight) < 0) ?? tiers[0];
  if (tier === 'nothing') return null;
  const items = ITEMS.filter((i) => i.from === from && i.tier === tier && !i.retired);
  return items.length ? pick(items) : { tier };
}

// Why someone can't gather because their Backpack is full, or null if there's room.
export function backpackFull(prefix, db, server, userId) {
  const { used, space } = placeOf(db, server, userId, 'backpack');
  if (used < space) return null;
  const fix = safeOf(db, server, userId) ? `move things to your safe with \`${prefix}safe\`` : `buy a safe in \`${prefix}shop\``;
  return `🎒 Your Backpack is full (${used}/${space}). Sell something, or ${fix}.`;
}

// "🎣 **Sam** caught 🐟 **Salmon** (common)!"
export function foundLine(emoji, name, verb, item) {
  const shout = item.tier === 'legendary' ? ' **WHAT?!**' : item.tier === 'epic' ? ' Nice!' : '';
  return `${emoji} **${name}** ${verb} ${item.emoji} **${item.name}** (${item.tier})!${shout}`;
}

export function gatherCommand({ name, description, kind, from, stream, verb, activity, energy, tiers, misses, hurt, noTool, cooldownText }) {
  const { noun, emoji } = KINDS[kind];

  return {
    name,
    category: 'economy',
    description,
    emoji,
    energy,
    cooldown: 5_000,
    economy: true,
    cooldownText,
    async run({ prefix, user, server, db, track, reply, notHere }) {
      if (!user) return notHere();

      const held = db.tool(server.key, user.id, kind);
      const tool = held && toolById.get(held.item);
      if (!tool) {
        const free = PROMOS.some((p) => toolById.get(p.tool)?.kind === kind && !db.promoClaimed(server.key, user.id, p.id));
        return reply(`${emoji} ${pick(noTool)}\nYou need a ${noun}. Check \`${prefix}shop\`${free ? " (there's a free one waiting for you!)" : '.'}`);
      }
      const full = backpackFull(prefix, db, server.key, user.id);
      if (full) return reply(full);

      const bar = energyOf(db, server.key, user.id);
      if (bar.points < energy) {
        return reply(`😮‍💨 You're exhausted. ${activity} takes ${energy} energy and you have ${bar.points}. Enough in ${formatWait(waitFor(bar, energy))}, or recover faster in \`${prefix}shop\`.`);
      }

      // Safe for the guaranteed uses, then a chance each time; past max it
      // always breaks. A break costs no energy: nothing was caught. One charm
      // may fire (only Lucky Break while breaking, which saves the tool).
      const breaking = held.uses >= tool.max || (held.uses >= tool.guaranteed && randomInt(100) < tool.breakChance);
      const { used, space } = placeOf(db, server.key, user.id, 'backpack');
      const drawn = drawCharm(db, server.key, user.id, { use: name, breaking, room: space - used });
      const charm = drawn?.charm;
      drawn?.use();
      const charmed = charm ? `${kickedIn(charm)}\n` : '';
      if ((breaking && !charm) || charm?.id === 'broken_mirror') {
        db.breakTool(server.key, user.id, kind, `broken_${tool.id}`);
        return reply(`${charmed}${emoji} ${tool.breaks} Buy a new one with \`${prefix}shop\`.`);
      }

      const party = partyFor(db, server.key, user.id, from, tiers);
      spend(db, server.key, user.id, charmedCost(charm, energy, bar.points));
      // A Quarry's pickaxes wear on only half the swings.
      if (!(party.job === 'mine' && party.tier >= 2 && randomInt(2))) db.useTool(server.key, user.id, kind);
      const found = charmedCatch(charm, party.yours, from);
      let lines;
      if (!found.length) {
        lines = [`${emoji} ${pick(misses)}`];
      } else if (found[0].tier === 'hospital') {
        const bill = hospitalize(db, server.key, user.id);
        track.lost(stream, bill.bill - bill.forgiven);
        lines = [`🏥 ${pick(hurt)} ${billLine(bill)}`];
      } else {
        for (const item of found) {
          db.addItem(server.key, user.id, item.id);
          track.earned(stream, item.price);
        }
        lines = found.map((item) => foundLine(emoji, user.name, verb, item));
      }
      lines.push(...crewTrip(db, server.key, user.id, party, { energy, stream, emoji, verb, track }));
      return reply(charmed + lines.join('\n'));
    },
  };
}
