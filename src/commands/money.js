import { formatMoney } from '../items.js';
import { findTarget } from '../members.js';
import { KINDS, toolById, licenseById, wear, breakable } from '../tools.js';
import { energyOf, waitFor } from '../energy.js';
import { placeOf, safeOf, contents } from '../storage.js';

export default {
  name: 'money',
  aliases: ['bank', 'balance', 'stats'],
  category: 'economy',
  usage: '[@user]',
  description: 'your money, energy, licenses, tools, Backpack and safe, or someone else\'s',
  cooldown: 5_000,
  economy: true,
  async run({ args, user, server, db, findMember, reply, notHere }) {
    let who = user;
    if (args.length) {
      const { query, member } = await findTarget(findMember, args);
      if (!member) return reply(`I can't find anyone called **${query}** here.`);
      who = member;
    }
    if (!who) return notHere();

    const licenses = db.licenses(server.key, who.id).map((id) => licenseById.get(id)?.name).filter(Boolean);
    const overview = [
      '**Overview**',
      `💵 ${formatMoney(db.cents(server.key, who.id))}`,
      energyLine(energyOf(db, server.key, who.id)),
      `Privileges: ${licenses.length ? licenses.join(' · ') : 'None'}`,
    ];

    // Tools in shop order (poles, pickaxes, guns); the safe is listed under Assets.
    const kinds = Object.keys(KINDS);
    const rounds = db.ammo(server.key, who.id);
    const tools = db.tools(server.key, who.id)
      .map((t) => ({ ...t, tool: toolById.get(t.item) }))
      .filter((t) => t.tool && t.kind !== 'safe')
      .sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind))
      .map(({ kind, uses, tool }) => `${KINDS[kind].emoji} ${tool.name} (${breakable(tool) ? wear(kind, uses) : `${rounds.get(tool.ammo) ?? 0} rounds left`})`);

    const backpack = placeOf(db, server.key, who.id, 'backpack');
    const assets = ['**Assets**', `🎒 Backpack (${backpack.used}/${backpack.space}): ${contents(backpack.rows)}`];
    const safe = safeOf(db, server.key, who.id);
    if (safe) {
      const box = placeOf(db, server.key, who.id, 'safe');
      assets.push(`${KINDS.safe.emoji} ${safe.name} (${box.used}/${box.space}): ${contents(box.rows)}`);
    }

    const header = who === user ? '' : `🏦 **${who.name}**\n`;
    return reply(`${header}${overview.join('\n')}\n\n**Tools**\n${tools.length ? tools.join(' · ') : 'None'}\n\n${assets.join('\n')}`);
  },
};

// "⚡ Energy: 9/60 (Fully recovered at 3:42 PM)", as a Haven timestamp so
// everyone reads it in their own time zone; just "60/60" when full.
function energyLine(bar) {
  if (bar.points >= bar.max) return `⚡ Energy: ${bar.points}/${bar.max}`;
  const ms = waitFor(bar, bar.max);
  const at = Math.ceil((Date.now() + ms) / 1000);
  return `⚡ Energy: ${bar.points}/${bar.max} (Fully recovered at <t:${at}:${ms < 86_400_000 ? 't' : 'f'}>)`;
}
