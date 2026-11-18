import { findTarget } from '../members.js';

export default {
  name: 'id',
  category: 'utility',
  usage: ['[@user]', 'channel'],
  description: 'your Haven user id, someone else\'s, or this channel\'s',
  cooldown: 3_600_000,
  async run({ args, user, channel, remote, findMember, reply, notHere }) {
    if (!args.length) return user ? reply(`🪪 Your ID is **${user.id}**`) : notHere();
    if (args.length === 1 && args[0].toLowerCase() === 'channel') {
      return remote || !channel ? notHere() : reply(`🪪 **#${channel.name}**'s ID is **${channel.id}**`);
    }
    const { query, member } = await findTarget(findMember, args);
    if (!member) return reply(`🤷 I can't find anyone called **${query}** here.`);
    return reply(`🪪 **${member.name}**'s ID is **${member.id}**`);
  },
};
