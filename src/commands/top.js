import { valueOf, formatMoney } from '../items.js';

const SHOWN = 10;
const MEDALS = ['🥇', '🥈', '🥉'];

export default {
  name: 'top',
  aliases: ['leaderboard'],
  category: 'economy',
  description: 'the richest people here: money plus everything in their Backpacks and safes',
  cooldown: 30_000,
  economy: true,
  async run({ user, server, servers, db, reply }) {
    const worth = new Map();
    const add = (id, cents) => worth.set(id, (worth.get(id) ?? 0) + cents);
    for (const { user_id, cents } of db.wallets(server.key)) add(user_id, cents);
    for (const { user_id, item, qty } of db.allItems(server.key)) add(user_id, valueOf(item, qty));
    // Someone with a ?link (db.js counts the linked profile) goes by its name too.
    const linkedNames = new Map();
    for (const l of db.links().filter((l) => l.server === server.key)) {
      const name = (await servers.find((s) => s.key === l.to_server)?.client.namesOf([l.to_user]))?.get(l.to_user);
      if (name) linkedNames.set(l.user_id, name);
    }

    const ranked = [...worth].filter(([, cents]) => cents > 0).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return reply('🏆 Nobody has any money yet. Go fishing!');

    const shown = ranked.slice(0, SHOWN);
    const names = await server.client.namesOf(shown.map(([id]) => id));
    const lines = shown.map(([id, cents], i) =>
      `${MEDALS[i] ?? `**${i + 1}.**`} ${linkedNames.get(id) ?? names.get(id) ?? `User ${id}`} · ${formatMoney(cents)}`);

    // People below the top ten still see where they stand.
    const mine = user ? ranked.findIndex(([id]) => id === user.id) : -1;
    if (mine >= SHOWN) lines.push(`…\n**${mine + 1}.** ${linkedNames.get(user.id) ?? user.name} (you) · ${formatMoney(ranked[mine][1])}`);
    return reply(`🏆 **Richest on ${server.name}**\n${lines.join('\n')}`);
  },
};
