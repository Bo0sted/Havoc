// Holiday events: while one is on, the first economy command someone uses
// gets its message and gifts, once per profile (claimed like a promo). Times
// are US Eastern. Ids are stored, so never rename one.
import { charmById, charmName } from './charms.js';
import { trophyById, trophyName, trophyPicture } from './trophies.js';
import { gained } from './colors.js';
import { formatMoney } from './items.js';

export const EVENTS = [
  {
    id: 'thanksgiving_2026',
    start: Date.parse('2026-11-26T00:00:00-05:00'),
    end: Date.parse('2026-11-27T00:00:00-05:00'),
    message: 'Thank you for using Havoc Bot. Although I appreciate you using the bot today, you should probably go spend it with your friends and family instead. Happy Thanksgiving.\n-Bo0sted',
    cents: 2_000_000,
    charm: 'thanksgiving_coupon',
    trophy: 'golden_turkey',
  },
];

// Someone's gift for an economy command now, or null if no event is on or
// they already had it. Claiming happens here; the returned function posts
// the message and the gifts, one per line, with the trophy's picture under
// them in the same message (uploaded once per server and reused after,
// like the wheel GIFs).
export function celebrate(db, server, userId, now = Date.now()) {
  const event = EVENTS.find((e) => now >= e.start && now < e.end);
  if (!event) return null;
  const charm = charmById.get(event.charm);
  const trophy = trophyById.get(event.trophy);
  if (!db.claimEvent(server, userId, event.id, event.cents, charm.id, charm.charges ?? 1, trophy.id)) return null;
  const text = [
    event.message,
    '',
    'You were given the following rewards:',
    `🎁 ${gained(event.cents)}`,
    `${charm.emoji} ${charmName(charm)} (${formatMoney(charm.cap)} off your next shop purchase)`,
    `${trophy.emoji} ${trophyName(trophy)}`,
  ].join('\n');
  return async ({ reply, replyWithImageOnce }) => {
    // The gifts are already given, so a failed upload sends the text alone
    // rather than stopping the command.
    await replyWithImageOnce(text, `trophy:${trophy.id}`, () => trophyPicture(trophy), `${trophy.id}.png`, 'image/png')
      .catch(async (err) => {
        console.error(`[events] ${trophy.id} picture failed:`, err);
        await reply(text);
      });
  };
}
