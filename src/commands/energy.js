import { DEFAULTS, settingsFor } from '../energy.js';
import { parseDuration, formatDuration, formatWait } from '../duration.js';

const MAX_LIMIT = 1000;

export default {
  name: 'energy',
  usage: ['', '<max> <X><sec|min|hr>', 'reset'],
  description: 'energy settings here: the bar\'s size and how often it refills by 1',
  admin: true,
  async run({ prefix, args, server, db, commands, reply }) {
    // The bar has to fit the most expensive action. A command with modes
    // (?hunt small / big) lists each one.
    const costs = commands.flatMap((c) => (c.energies
      ? Object.entries(c.energies).map(([mode, energy]) => ({ name: `${c.name} ${mode}`, energy }))
      : c.energy ? [c] : []));
    const least = Math.max(...costs.map((c) => c.energy));
    const usage = `Usage: \`${prefix}energy <max> <X><sec|min|hr>\` (max ${least}-${MAX_LIMIT}; e.g. \`${prefix}energy 60 1min\`), or \`${prefix}energy reset\``;
    const describe = ({ max, every }) => {
      const perHour = 3_600_000 / every;
      const rates = costs.map((c) => `${Math.floor(perHour / c.energy)} \`${prefix}${c.name}\``).join(' or ');
      return `a bar of **${max}**, +1 every **${formatDuration(every)}** (empty to full in ${formatWait(max * every)}; about ${rates} an hour)`;
    };

    if (!args.length) {
      const custom = db.energySettings(server.key);
      return reply(`⚡ **Energy on ${server.name}**: ${describe(settingsFor(db, server.key))}${custom ? '' : ' (default)'}.`);
    }
    if (args.length === 1 && args[0].toLowerCase() === 'reset') {
      return reply(db.clearEnergySettings(server.key)
        ? `✅ Energy on ${server.name} is back to the default: ${describe(DEFAULTS)}.`
        : 'Energy is already on the default here.');
    }

    const max = /^\d+$/.test(args[0]) ? Number(args[0]) : null;
    const every = parseDuration(args.slice(1).join(''));
    if (!max || max < least || max > MAX_LIMIT || !every) return reply(usage);
    db.setEnergySettings(server.key, max, every);
    return reply(`✅ Energy on ${server.name} is now ${describe({ max, every })}.`);
  },
};
