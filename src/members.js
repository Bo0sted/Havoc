// Turns "@name" arguments into a member. Display names can have spaces, so
// the whole text is tried before just the first word.
export async function findTarget(findMember, args) {
  const query = args.join(' ').replace(/^@/, '').trim();
  if (!query) return { query, member: null };
  const member = (await findMember(query)) ?? (await findMember(args[0].replace(/^@/, '')));
  return { query, member };
}
