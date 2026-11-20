// An admin's 👎 (any skin tone) on one of Havoc's messages deletes it, to
// clean up a reply that shouldn't be there. Only Havoc's own messages (the
// ones it remembers sending, for OWN_DAYS), never the command it answered or
// anyone else's, whatever the bot account is allowed to delete.
export const OWN_DAYS = 30;
const THUMBS_DOWN = '👎';

const isThumbsDown = (emoji) => emoji.replace(/[\u{1F3FB}-\u{1F3FF}️]/gu, '') === THUMBS_DOWN;

// Wires it up for one server: remembers what Havoc sends, and watches reactions.
export function watchThumbsDown(server, db) {
  server.client.on('own-message', ({ message }) => db.rememberOwnMessage(server.key, message.id));
  server.client.on('reactions', ({ channelCode, messageId, reactions }) => {
    const byAdmin = reactions.some((r) => server.admins.has(r.user_id) && isThumbsDown(r.emoji));
    if (!byAdmin || !db.ownsMessage(server.key, messageId)) return;
    db.forgetOwnMessage(server.key, messageId);
    server.client.deleteMessage(channelCode, messageId);
    console.log(`[${server.name}] Deleted message ${messageId} after an admin's 👎.`);
  });
}
