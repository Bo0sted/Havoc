import { linkLine } from '../members.js';

// ?link: the first profile uses the second one for everything economy
// (db.js follows the link), on its server and in what others do to it.
// Nothing is copied or changed: removing the link brings the first profile
// back as it was. A profile can be in one link at most, on either side.
export default {
  name: 'link',
  usage: ['<server>:<id> <server>:<id>', 'list', 'remove <server>:<id>'],
  description: "make the first profile use the second one's money, stuff and progress until removed; `list` shows every link",
  admin: true,
  async run({ prefix, args, servers, db, reply }) {
    const usage = `Usage: \`${prefix}link <server>:<id> <server>:<id>\` (the first uses the second), \`${prefix}link list\` or \`${prefix}link remove <server>:<id>\``;
    const action = args[0]?.toLowerCase();
    // The profile a link overrides, as `?link remove` takes it.
    const overridden = (l) => `${servers.find((s) => s.key === l.server)?.name ?? l.server}:${l.user_id}`;

    if (action === 'list') {
      const links = db.links();
      if (!links.length) return reply('🔗 No profiles are linked.');
      const lines = await Promise.all(links.map(async (l) => `${await linkLine(servers, l)} (\`${overridden(l)}\`)`));
      return reply(`🔗 **Linked profiles**\n${lines.join('\n')}`);
    }

    if (action === 'remove') {
      const who = profile(servers, args.slice(1).join(' '));
      if (typeof who === 'string') return reply(who === '' ? usage : who);
      const link = db.linkOf(who.server.key, who.id);
      if (!link) return reply(`🔗 ${who.server.name}:${who.id} isn't linked to anything.`);
      if (link.server !== who.server.key || link.user_id !== who.id) {
        return reply(`🔗 ${who.server.name}:${who.id} is the profile being synced from. Remove the link with \`${prefix}link remove ${overridden(link)}\`.`);
      }
      const line = await linkLine(servers, link);
      db.unlink(link.server, link.user_id);
      return reply(`🔗 Removed ${line}. ${overridden(link)} is back to its own profile.`);
    }

    // Ids are digits, so a server name (which can have spaces) ends at the colon before them.
    const [, first, second] = args.join(' ').match(/^(.+?:\s*\d+)\s+(.+:\s*\d+)$/) ?? [];
    if (!first) return reply(usage);
    const from = profile(servers, first);
    if (typeof from === 'string') return reply(from);
    const to = profile(servers, second);
    if (typeof to === 'string') return reply(to);
    if (from.server === to.server && from.id === to.id) return reply("🔗 That's the same profile.");
    for (const p of [from, to]) {
      if (!(await p.server.client.namesOf([p.id])).get(p.id)) return reply(`I can't find anyone with the id **${p.id}** on ${p.server.name}.`);
      const taken = db.linkOf(p.server.key, p.id);
      if (taken) return reply(`🔗 ${p.server.name}:${p.id} is already linked (${await linkLine(servers, taken)}). \`${prefix}link remove ${overridden(taken)}\` first.`);
    }
    db.link(from.server.key, from.id, to.server.key, to.id);
    const line = await linkLine(servers, db.linkOf(from.server.key, from.id));
    return reply(`🔗 Linked ${line}. ${from.server.name}:${from.id} uses the profile on ${to.server.name} for everything now, and its own stays as it is until \`${prefix}link remove ${from.server.name}:${from.id}\`.`);
  },
};

// "Personal:2" → { server, id }, or why it isn't one ('' for nothing typed).
function profile(servers, text) {
  if (!text.trim()) return '';
  const at = text.lastIndexOf(':');
  const id = text.slice(at + 1).trim();
  if (at < 0 || !/^\d+$/.test(id)) return `**${text.trim()}** isn't a profile: use \`<server>:<id>\`.`;
  const server = servers.find((s) => s.key === text.slice(0, at).trim().toLowerCase());
  if (!server) return `No server called **${text.slice(0, at).trim()}**. Servers: ${servers.map((s) => s.name).join(', ')}`;
  return { server, id: Number(id) };
}
