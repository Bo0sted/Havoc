import { findTarget } from '../members.js';
import { KINDS, toolById, licenseById, wear, breakable } from '../tools.js';
import { energyOf, waitFor } from '../energy.js';
import { placeOf, safeOf, contents, worthOf } from '../storage.js';
import { gained, lost, RARITY_KEY } from '../colors.js';
import { pocketContents } from '../charms.js';
import { STREAMS, TRACKING_START } from '../earnings.js';
import { nextAfter } from '../milestones.js';

export default {
  name: 'money',
  aliases: ['bank', 'balance', 'stats'],
  category: 'economy',
  usage: ['[@user]', 'extra [@user]'],
  description: 'your money, energy, licenses, tools, Backpack and safe, or someone else\'s; `extra` shows what was earned and lost where, and the next milestone',
  cooldown: 5_000,
  economy: true,
  jailFree: true, // looking at your stats still works in ?wheel jail
  async run({ prefix, args, user, server, db, findMember, reply, notHere }) {
    const extra = args[0]?.toLowerCase() === 'extra';
    if (extra) args = args.slice(1);
    let who = user;
    if (args.length) {
      const { query, member } = await findTarget(findMember, args);
      if (!member) return reply(`I can't find anyone called **${query}** here.`);
      who = member;
    }
    if (!who) return notHere();
    const header = who === user ? '' : `🏦 **${who.name}**\n`;
    if (extra) return reply(header + earnings(db, server, who));

    const licenses = db.licenses(server.key, who.id).map((id) => licenseById.get(id)?.name).filter(Boolean);
    const overview = [
      '**Overview**',
      `💵 ${gained(db.cents(server.key, who.id))}`,
      `Net Worth: ${gained(worthOf(db, server.key, who.id))}`,
      energyLine(energyOf(db, server.key, who.id)),
      `Privileges: ${licenses.length ? licenses.join(' · ') : 'None'}`,
      `Profile Settings: Gifts ${db.giftsOff(server.key, who.id) ? 'Off' : 'On'}`,
    ];

    // Tools in shop order (poles, pickaxes, guns, crew outfits); the safe is listed under Assets.
    const kinds = Object.keys(KINDS);
    const rounds = db.ammo(server.key, who.id);
    const tools = db.tools(server.key, who.id)
      .map((t) => ({ ...t, tool: toolById.get(t.item) }))
      .filter((t) => t.tool && t.kind !== 'safe')
      .sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind))
      .map(({ kind, uses, tool }) => {
        const note = breakable(tool) ? wear(kind, uses) : tool.ammo ? `${rounds.get(tool.ammo) ?? 0} rounds left` : '';
        return `${KINDS[kind].emoji} ${tool.name}${note && ` (${note})`}`;
      });

    const backpack = placeOf(db, server.key, who.id, 'backpack');
    const assets = ['**Assets**', RARITY_KEY, `🎒 Backpack (${backpack.used}/${backpack.space}): ${contents(backpack.rows)}`];
    const safe = safeOf(db, server.key, who.id);
    if (safe) {
      const box = placeOf(db, server.key, who.id, 'safe');
      assets.push(`${KINDS.safe.emoji} ${safe.name} (${box.used}/${box.space}): ${contents(box.rows)}`);
    }
    const pocket = db.pocket(server.key, who.id);
    assets.push(`🍀 Pocket (${pocket.length}): ${pocketContents(pocket)}`);

    return reply(`${header}${overview.join('\n')}\n\n**Tools**\n${tools.length ? tools.join(' · ') : 'None'}\n\n${assets.join('\n')}\n\n${tips(prefix)}`);
  },
};

// Pointers to the commands people miss, at the bottom (owner's wording).
const tips = (p) => [
  `Pro tip: \`${p}value <item>\` an item's rarity and price`,
  `\`${p}charm list\` what every charm does`,
  `\`${p}stats extra\` more fun numbers`,
].join('\n');

// "⚡ Energy: 9/60 (Fully recovered at 3:42 PM)", as a Haven timestamp so
// everyone reads it in their own time zone; just "60/60" when full. During
// an Energy Surge it also says when that ends.
function energyLine(bar) {
  const surge = bar.surgeUntil ? ` · Energy Surge until <t:${Math.ceil(bar.surgeUntil / 1000)}:t>` : '';
  if (bar.points >= bar.max) return `⚡ Energy: ${bar.points}/${bar.max}${surge}`;
  const ms = waitFor(bar, bar.max);
  const at = Math.ceil((Date.now() + ms) / 1000);
  return `⚡ Energy: ${bar.points}/${bar.max} (Fully recovered at <t:${at}:${ms < 86_400_000 ? 't' : 'f'}>)${surge}`;
}

// ?stats extra: what someone had before tracking started, then what was
// earned and lost in each stream since (totals that only go up), the grand
// totals, and how far the next milestone is.
function earnings(db, server, who) {
  const rows = db.earnings(server.key, who.id).filter((r) => r.earned || r.lost);
  const before = rows.find((r) => r.stream === 'before')?.earned ?? 0;
  const order = Object.keys(STREAMS);
  const lines = rows
    .filter((r) => r.stream !== 'before')
    .sort((a, b) => (order.indexOf(a.stream) + 1 || Infinity) - (order.indexOf(b.stream) + 1 || Infinity))
    .map(({ stream, earned, lost: gone }) => {
      const { label = stream, emoji, earned: earnedLabel = 'earned', lost: lostLabel = 'lost' } = STREAMS[stream] ?? {};
      const parts = [earned && `${gained(earned)} ${earnedLabel}`, gone && `${lost(gone)} ${lostLabel}`].filter(Boolean);
      return `${emoji ? `${emoji} ` : ''}${label}: ${parts.join(' · ')}`;
    });
  const total = (field) => rows.reduce((sum, r) => sum + r[field], 0);
  const count = db.commandCount(server.key, who.id)?.total ?? 0;
  const next = nextAfter(count);
  return [
    ...(before ? [`**Before ${TRACKING_START}**`, `What you had: ${gained(before)}`, ''] : []),
    `**After ${TRACKING_START}**`,
    ...(lines.length ? lines : ['Nothing earned or lost yet.']),
    '',
    `**Total earned: ${gained(total('earned'))} · Total lost: ${lost(total('lost'))}**`,
    `Next milestone: ${next.toLocaleString('en-US')} commands (${(next - count).toLocaleString('en-US')} to go)`,
  ].join('\n');
}
