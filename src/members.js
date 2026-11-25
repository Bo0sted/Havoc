// Turns "@name" arguments into a member. Display names can have spaces, so
// the whole text is tried before just the first word.
export async function findTarget(findMember, args) {
  const query = args.join(' ').replace(/^@/, '').trim();
  if (!query) return { query, member: null };
  const member = (await findMember(query)) ?? (await findMember(args[0].replace(/^@/, '')));
  return { query, member };
}

// "Community:Sam ➡️ Personal:Sam" for a ?link (db.linkOf): the profile
// synced from, then the one it stands in for, by server and display name.
export async function linkLine(servers, link) {
  const side = async (key, id) => {
    const server = servers.find((s) => s.key === key);
    const name = (await server?.client.namesOf([id]))?.get(id);
    return `${server?.name ?? key}:${name ?? `User ${id}`}`;
  };
  return `${await side(link.to_server, link.to_user)} ➡️ ${await side(link.server, link.user_id)}`;
}
