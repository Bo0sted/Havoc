// Sections in the order they're listed; admin commands always go last.
const SECTIONS = [
  ['economy', '🎣 Economy'],
  ['fun', '🎉 Fun'],
  ['utility', '🧰 Utility'],
  ['admin', '🛡️ Admin'],
];

// "`?sell <item> [amount|all]` / `?sell all` (also `?x`) · description"
function line(prefix, c) {
  const forms = [c.usage ?? ''].flat().map((u) => `\`${prefix}${c.name}${u && ` ${u}`}\``).join(' / ');
  const also = c.aliases?.length ? ` (also ${c.aliases.map((a) => `\`${prefix}${a}\``).join(', ')})` : '';
  return `${forms}${also} · ${c.description}`;
}

export default {
  name: 'help',
  category: 'utility',
  description: 'this list',
  cooldown: 5_000,
  dm: true,
  // In a DM, only the commands that work there.
  async run({ prefix, isAdmin, dm, commands, reply }) {
    const sections = SECTIONS
      .filter(([id]) => id !== 'admin' || isAdmin)
      .map(([id, title]) => [title, commands.filter((c) => (c.admin ? 'admin' : c.category) === id && (!dm || c.dm))])
      .filter(([, list]) => list.length)
      .map(([title, list]) => `**${title}**\n${list.map((c) => line(prefix, c)).join('\n')}`);
    return reply(`**Havoc commands**\n\n${sections.join('\n\n')}`);
  },
};
