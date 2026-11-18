export default {
  name: 'help',
  description: 'this list',
  cooldown: 5_000,
  async run({ prefix, isAdmin, commands, reply }) {
    const lines = commands
      .filter((c) => !c.admin || isAdmin)
      .map((c) => {
        const also = c.aliases?.length ? ` (also ${c.aliases.map((a) => `\`${prefix}${a}\``).join(', ')})` : '';
        return `\`${prefix}${c.name}\`${also} ${c.description}${c.admin ? ' *(admin)*' : ''}`;
      });
    return reply(`**Havoc commands**\n${lines.join('\n')}`);
  },
};
