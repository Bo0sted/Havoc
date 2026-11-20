import { CHARMS, TYPES, SEVERITIES, findCharm, charmName } from '../charms.js';

// "🐇 Rabbit's Foot · 🍀 Lucky charm · Strong: Your next fish, mine or hunt is guaranteed epic."
const describe = (charm) => {
  const [severity, paint] = SEVERITIES[charm.type][charm.severity];
  const { emoji, label } = TYPES[charm.type];
  const uses = charm.charges ? ` (${charm.charges} uses)` : '';
  return `${charm.emoji} ${charmName(charm)} · ${emoji} ${label} · ${paint(severity)}${uses}: ${charm.text}`;
};

export default {
  name: 'charm',
  aliases: ['charms'],
  category: 'economy',
  usage: ['<name>', 'list'],
  description: 'what a lucky or misfortune charm does, or all of them (you win them on the wheel)',
  cooldown: 5_000,
  async run({ prefix, args, reply }) {
    if (!args.length) return reply(`Usage: \`${prefix}charm <name>\` or \`${prefix}charm list\``);
    if (args.length === 1 && args[0].toLowerCase() === 'list') {
      const sections = Object.entries(TYPES).map(([type, { emoji, label }]) => {
        const key = Object.values(SEVERITIES[type]).map(([name, , dot]) => `${dot} ${name}`).join(' · ');
        const lines = CHARMS.filter((c) => c.type === type).map((c) => `${c.emoji} ${charmName(c)}: ${c.text}`);
        return [`${emoji} **${label}s** (${key})`, ...lines].join('\n');
      });
      return reply([...sections, `Charms sit in your Pocket (\`${prefix}stats\`). Only one fires per command, picked at random from the ones that fit it, good or bad.`]);
    }
    const text = args.join(' ');
    const { charm, matches } = findCharm(text);
    if (charm) return reply(describe(charm));
    if (!matches.length) return reply(`There's no charm called **${text}**. \`${prefix}charm list\` shows them all.`);
    return reply(`Which one? ${matches.map((c) => `${c.emoji} ${c.name}`).join(', ')}`);
  },
};
