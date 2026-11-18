// "#bot test" is typed (and linked by Haven) as #bot_test.
const tag = (channel) => `#${channel.name.replace(/\s+/g, '_')}`;

export default {
  name: 'botchannel',
  usage: ['list', '<id|#channel>'],
  description: 'list bot channels, or add/remove one (once set, commands only work in them)',
  admin: true,
  async run({ prefix, args, server, db, reply }) {
    const usage = `Usage: \`${prefix}botchannel list\` or \`${prefix}botchannel <id|#channel>\``;
    if (!args.length) return reply(usage);
    const client = server.client;
    const listed = db.botChannels(server.key);

    if (args.length === 1 && args[0].toLowerCase() === 'list') {
      if (!listed.length) return reply('📌 No bot channels: commands work in every channel.');
      const lines = listed.map((id) => {
        const channel = client.channelById(id);
        return channel ? `${tag(channel)} (${id})` : `*unknown channel* (${id})`;
      });
      return reply(`📌 **Bot channels**\n${lines.join('\n')}`);
    }

    // A listed id can always be removed, even once Havoc can't see the channel.
    const text = args.join(' ');
    const id = /^\d+$/.test(text) ? Number(text) : null;
    const channel = id !== null ? client.channelById(id) : client.channelByName(text);
    if (!channel && !listed.includes(id)) {
      return reply(`I can't find a channel ${id !== null ? 'with ID' : 'called'} **${text}** here.`);
    }

    const channelId = channel?.id ?? id;
    const name = channel ? `${tag(channel)} (${channelId})` : `*unknown channel* (${channelId})`;
    if (db.toggleBotChannel(server.key, channelId)) {
      return reply(`📌 ${name} is now a bot channel. Commands only work in bot channels here.`);
    }
    const left = listed.length - 1;
    return reply(`📌 ${name} is no longer a bot channel.${left ? '' : ' Commands work in every channel again.'}`);
  },
};
