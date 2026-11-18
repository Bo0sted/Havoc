import { parseDuration, formatDuration } from '../duration.js';

export default {
  name: 'cooldown',
  description: 'list cooldowns; `cooldown <command> <X><sec|min|hr>` overrides one here, `cooldown reset <command>` removes it',
  admin: true,
  async run({ prefix, args, server, commands, db, cooldowns, reply }) {
    const find = (word = '') => commands.find((c) => [c.name, ...(c.aliases ?? [])].includes(word.toLowerCase()));
    const usage = `Usage: \`${prefix}cooldown <command> <X><sec|min|hr>\` (sec and min 1-60, hr 1-24), or \`${prefix}cooldown reset <command>\``;

    if (!args.length) {
      const overrides = db.overrides(server.key);
      const lines = commands.map((c) => {
        const def = formatDuration(c.cooldown ?? 0);
        return overrides.has(c.name)
          ? `\`${prefix}${c.name}\` **${formatDuration(overrides.get(c.name))}** (override, default ${def})`
          : `\`${prefix}${c.name}\` ${def}`;
      });
      return reply(`⏱️ **Cooldowns on ${server.name}** (admins skip them)\n${lines.join('\n')}`);
    }

    if (args[0].toLowerCase() === 'reset') {
      const cmd = find(args[1]);
      if (!cmd) return reply(usage);
      return reply(db.clearOverride(server.key, cmd.name)
        ? `✅ \`${prefix}${cmd.name}\` is back to its default cooldown (${formatDuration(cmd.cooldown ?? 0)}).`
        : `\`${prefix}${cmd.name}\` has no override.`);
    }

    const cmd = find(args[0]);
    const ms = parseDuration(args.slice(1).join(''));
    if (!cmd || !ms) return reply(usage);
    db.setOverride(server.key, cmd.name, ms);
    return reply(`✅ \`${prefix}${cmd.name}\` now has a ${formatDuration(ms)} cooldown on ${server.name}.`);
  },
};
