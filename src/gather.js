// ?fish and ?mine: spend energy and use your tool (which may break), then
// roll a tier by weight and an item within it (?hunt shares the rolling). Rolls use crypto.randomInt,
// the OS's secure random source, like every game.
import { randomInt } from 'node:crypto';
import { ITEMS } from './items.js';
import { KINDS, PROMOS, toolById } from './tools.js';
import { energyOf, spend, waitFor } from './energy.js';
import { formatWait } from './duration.js';
import { placeOf, safeOf } from './storage.js';

export const pick = (list) => list[randomInt(list.length)];

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

export function gatherCommand({ name, description, kind, from, stream, verb, activity, energy, tiers, misses, noTool, cooldownText }) {
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
      // always breaks. A break costs no energy: nothing was caught.
      if (held.uses >= tool.max || (held.uses >= tool.guaranteed && randomInt(100) < tool.breakChance)) {
        db.breakTool(server.key, user.id, kind, `broken_${tool.id}`);
        return reply(`${emoji} ${tool.breaks} Buy a new one with \`${prefix}shop\`.`);
      }

      spend(db, server.key, user.id, energy);
      db.useTool(server.key, user.id, kind);
      const item = rollTier(tiers, from);
      if (!item) return reply(`${emoji} ${pick(misses)}`);
      db.addItem(server.key, user.id, item.id);
      track.earned(stream, item.price);
      return reply(foundLine(emoji, user.name, verb, item));
    },
  };
}
