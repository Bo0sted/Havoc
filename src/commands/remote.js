export default {
  name: 'remote',
  usage: ['<server>', ''],
  description: 'run your commands as if on another server; alone, come back',
  admin: true,
  async run({ prefix, args, home, servers, remotes, reply }) {
    if (!args.length) {
      remotes.clear();
      return reply('🛰️ Remote off. Commands run on this server again.');
    }
    const target = servers.find((s) => s.key === args[0].toLowerCase());
    if (!target) return reply(`No server by that name. Servers: ${servers.map((s) => s.name).join(', ')}`);
    if (target === home) {
      remotes.clear();
      return reply('🛰️ That\'s this server, so remote is off.');
    }
    remotes.set(target);
    return reply(`🛰️ Your commands now run on **${target.name}**. Replies still come here. Type \`${prefix}remote\` to stop.`);
  },
};
