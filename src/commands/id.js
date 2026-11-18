import { findTarget } from '../members.js';

export default {
  name: 'id',
  category: 'utility',
  usage: '[@user]',
  description: 'your Haven user id, or someone else\'s',
  cooldown: 3_600_000,
  async run({ args, user, findMember, reply, notHere }) {
    if (!args.length) return user ? reply(`🪪 Your ID is **${user.id}**`) : notHere();
    const { query, member } = await findTarget(findMember, args);
    if (!member) return reply(`🤷 I can't find anyone called **${query}** here.`);
    return reply(`🪪 **${member.name}**'s ID is **${member.id}**`);
  },
};
