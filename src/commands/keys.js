// Havoc's key log for every server it's on (see Encryption): every key it
// made or accepted, on which server and who it's for. Oldest first (#1 is the
// first key ever made), all of it, over as many messages as it takes (sent
// one after another at Havoc's usual pace). An entry's number never changes.
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
  description: "every encryption key Havoc made or accepted, on every server, and who it's for; a number shows one in full",
  admin: true,
  async run({ prefix, args, servers, db, reply }) {
    const nameOf = (key) => servers.find((s) => s.key === key)?.name ?? key;
    const forWhom = (e) => recipients(e.details).replace('this server', nameOf(e.server));
    const log = db.keyLog();
    if (!log.length) return reply('🔑 The key log is empty.');
    if (args.length) {
      const entry = log.find((e) => String(e.id) === args[0].replace(/^#/, ''));
      if (!entry) return reply(`There's no entry ${args[0]}. \`${prefix}keys\` lists them.`);
      return reply([
        `🔑 **Key log #${entry.id}**`,
        `**When:** <t:${sec(entry.at)}:f> (<t:${sec(entry.at)}:R>)`,
        `**Server:** ${nameOf(entry.server)}`,
        `**What:** ${entry.summary}`,
        `**For:** ${forWhom(entry)}`,
        ...entry.details.filter(([label]) => label !== 'For').map(([label, value]) => `**${label}:** ${value}`),
      ].join('\n'));
    }
    // "#3", not "3.": Haven renumbers lines starting "3. " as a list of its own.
    const lines = log.map((e) => `**#${e.id}** · <t:${sec(e.at)}:R> · **${nameOf(e.server)}** · ${e.summary} · for ${forWhom(e)}`);
    return reply(`🔑 **Key log** (${log.length}, oldest first)\n${lines.join('\n')}\n\`${prefix}keys <number>\` shows one in full.`);
  },
};
