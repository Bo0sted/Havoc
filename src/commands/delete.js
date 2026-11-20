// Deletes one of Havoc's own messages from its Haven link (right-click a
// message, Copy link): https://<haven>/app.html?channel=<code>&message=<id>.
// Never anyone else's, even if the bot account may delete them.
const usage = (prefix) => `Usage: \`${prefix}delete <message link>\` (right-click one of my messages and copy its link)`;

// { channel, message } from a link, or null.
function parse(text) {
  try {
    const params = new URL(text).searchParams;
    const channel = params.get('channel') ?? '';
    const message = params.get('message') ?? '';
    if (!/^[a-f0-9]{8}$/i.test(channel) || !/^\d+$/.test(message)) return null;
    return { channel, message: Number(message) };
  } catch {
    return null;
  }
}

export default {
  name: 'delete',
  usage: '<message link>',
  description: "delete one of Havoc's messages from its link",
  admin: true,
  async run({ prefix, args, home, servers, reply }) {
    const link = args.length === 1 && parse(args[0].replace(/^<|>$/g, ''));
    if (!link) return reply(usage(prefix));
    // Whichever of Havoc's servers has that channel (this one first). The
    // link's host can differ from the address Havoc connects to (a tunnel, a
    // proxy), so the channel says which server it's on, not the host. Only
    // Havoc's own messages can go, so this works from any server.
    const target = [home, ...servers.filter((s) => s !== home)].find((s) => s.client?.channel(link.channel));
    if (!target) return reply("I can't find that channel.");
    const { client } = target;
    const message = await client.messageById(link.channel, link.message);
    if (!message) return reply("I can't find that message.");
    if (message.user_id !== client.user.id) return reply('I can only delete my own messages.');
    return reply(await client.deleteMessage(link.channel, link.message) ? '🗑️ Deleted.' : "Haven wouldn't let me delete that message.");
  },
};
