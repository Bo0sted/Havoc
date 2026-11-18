// Runs `apply(server)` on every server one at a time, editing one reply as
// it goes ("Setting the PFP: 1/2 servers...") and then into a summary with
// the reason for each failure. Reasons come from the error's `reason`;
// anything else is shown as a plain failure. The technical side (an
// unexpected error, or a reason's `cause`) only goes to the console.
export async function everywhere({ servers, replyEditable }, { emoji, doing, done }, apply) {
  const total = servers.length;
  const progress = (n) => `${emoji} ${doing}: ${n}/${total} servers...`;
  const edit = await replyEditable(progress(0));
  const failed = [];
  for (const [i, server] of servers.entries()) {
    try {
      await apply(server);
    } catch (err) {
      if (!err.reason || err.cause) console.error(`[${server.name}] ${doing} failed:`, err.reason ? `${err.reason}:` : '', err.cause ?? err);
      failed.push(`**${server.name}**: ${err.reason ?? 'something went wrong'}`);
    }
    await edit(progress(i + 1), { quiet: true });
  }
  const summary = `${emoji} ${done} for ${total - failed.length}/${total} servers`;
  return edit(failed.length ? `${summary}, ${failed.length} failed:\n${failed.join('\n')}` : `${summary}.`);
}
