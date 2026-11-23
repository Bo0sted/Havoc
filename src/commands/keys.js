// The server's key log (see Encryption): every key Havoc made or accepted,
// for which server and who it's for. All of it, over as many messages as it
// takes (sent one after another at Havoc's usual pace). Numbered oldest first,
// so a number always means the same entry.
const sec = (ms) => Math.floor(ms / 1000);

// Who an entry's key is for. Entries from before 'For' was recorded say it
// as the group's members or the person whose key it was.
const recipients = (details) => {
  const value = (label) => details.find(([l]) => l === label)?.[1];
  return value('For') ?? value('Members') ?? value('Who') ?? 'everyone on this server';
};

export default {
  name: 'keys',
  usage: ['', '<number>'],
  description: "every encryption key Havoc made or accepted on this server, and who it's for; a number shows one in full",
  admin: true,
  async run({ prefix, args, server, db, reply }) {
    const log = db.keyLog(server.key);
    if (!log.length) return reply(`🔑 The key log for **${server.name}** is empty.`);
    if (args.length) {
      const entry = /^\d+$/.test(args[0]) && log[Number(args[0]) - 1];
      if (!entry) return reply(`There's no entry ${args[0]}. They go from 1 to ${log.length} (\`${prefix}keys\` lists them).`);
      const details = entry.details.some(([l]) => l === 'For') ? entry.details : [['For', recipients(entry.details)], ...entry.details];
      return reply([
        `🔑 **Key log #${args[0]}**`,
        `**When:** <t:${sec(entry.at)}:f> (<t:${sec(entry.at)}:R>)`,
        `**Server:** ${server.name}`,
        `**What:** ${entry.summary}`,
        ...details.map(([label, value]) => `**${label}:** ${value}`),
      ].join('\n'));
    }
    const lines = log.map((e, i) => `${i + 1}. <t:${sec(e.at)}:R> · **${server.name}** · ${e.summary} · for ${recipients(e.details)}`).reverse();
    return reply(`🔑 **Key log for ${server.name}** (${log.length}, newest first)\n${lines.join('\n')}\n\`${prefix}keys <number>\` shows one in full.`);
  },
};
