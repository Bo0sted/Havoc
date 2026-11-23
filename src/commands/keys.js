// The server's key log (see Encryption): when Havoc made its own keys or a
// new key for a group DM, and every changed key it accepted for someone.
// Numbered oldest first, so a number always means the same entry.
const LATEST = 25;

const sec = (ms) => Math.floor(ms / 1000);

export default {
  name: 'keys',
  usage: ['', '<number>'],
  description: "Havoc's encryption key log, or one entry in full",
  admin: true,
  async run({ prefix, args, server, db, reply }) {
    const log = db.keyLog(server.key);
    if (!log.length) return reply('🔑 The key log is empty.');
    if (args.length) {
      const entry = /^\d+$/.test(args[0]) && log[Number(args[0]) - 1];
      if (!entry) return reply(`There's no entry ${args[0]}. They go from 1 to ${log.length} (\`${prefix}keys\` lists them).`);
      return reply([
        `🔑 **Key log #${args[0]}**`,
        `**When:** <t:${sec(entry.at)}:f> (<t:${sec(entry.at)}:R>)`,
        `**What:** ${entry.summary}`,
        ...entry.details.map(([label, value]) => `**${label}:** ${value}`),
      ].join('\n'));
    }
    const lines = log.map((e, i) => `${i + 1}. <t:${sec(e.at)}:R> · ${e.summary}`).slice(-LATEST).reverse();
    const more = log.length > LATEST ? `Showing the latest ${LATEST} of ${log.length}. ` : '';
    return reply(`🔑 **Key log** (newest first)\n${lines.join('\n')}\n${more}\`${prefix}keys <number>\` shows one in full.`);
  },
};
