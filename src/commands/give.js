import { formatMoney } from '../items.js';
import { pick } from '../gather.js';
import { placeOf, choose, fit, describe, TIERS } from '../storage.js';
import { gained, lost } from '../colors.js';

// Gives cash, or items from your Backpack, to someone else. It all moves
// first; then a few seconds of dots for show, the result, and a ping for
// the receiver. Counted as 'gifts' (given / received) in ?stats extra.
// `?give off` stops anyone (admins too) giving you anything until `?give on`.
const CASH = [
  '💸 Laundering it through a laundromat',
  "💸 Explaining to the IRS that it's a gift",
  '💸 Waiting for the check to clear',
  '💸 Wiring it through a Nigerian prince',
  '💸 Sliding it across the table in an envelope',
];
const ITEMS = [
  '📦 Writing "FRAGILE" on all six sides',
  '📦 Sneaking it past customs',
  '📦 Wrapping it in way too much bubble wrap',
  '📦 Shipping it with 2-second delivery',
  '📦 Wiping off the fingerprints',
];
// When the receiver has gifts off (owner-picked, cash or items to match).
const BLOCKED_CASH = [
  '🚫 The bank flagged it as suspicious and froze the transfer.',
  '🚫 They slid the envelope right back across the table.',
  "🚫 Zelle says the recipient isn't enrolled.",
  '🚫 They said "I don\'t take handouts."',
  '🚫 The check bounced. Somehow, in reverse.',
  "🚫 They don't accept bribes.",
  '🚫 They mailed it back with a polite note.',
];
const BLOCKED_ITEMS = [
  '🚫 The package came back marked "Return to Sender".',
  '🚫 Customs seized it at the border.',
  "🚫 They saw the delivery truck and pretended they weren't home.",
  '🚫 There\'s a "No Soliciting" sign on their door.',
  '🚫 They refused to sign for it.',
  '🚫 Their dog chased the delivery guy off the porch.',
];
const DOTS = ['.', '..', '...'];
const FRAME = 850;

// "500", "$500", "12.50" or "$1,000" in cents; null if it isn't an amount.
function parseCash(text) {
  if (!/^\$?(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(text)) return null;
  const cents = Math.round(Number(text.replace(/[$,]/g, '')) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

// The receiver is the longest run of leading words that's a member (display
// names can have spaces); whatever follows is what's given.
async function splitTarget(findMember, args) {
  for (let n = Math.min(args.length - 1, 4); n >= 1; n--) {
    const member = await findMember(args.slice(0, n).join(' ').replace(/^@/, ''));
    if (member) return { member, rest: args.slice(n) };
  }
  return { query: args[0].replace(/^@/, '') };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: 'give',
  aliases: ['zelle', 'gift'],
  category: 'economy',
  usage: ['<user> <amount>', '<user> <item> [amount|all]', 'off', 'on'],
  description: 'give someone cash, or items from your Backpack; `off` stops anyone giving you anything, `on` allows it again',
  cooldown: 5_000,
  economy: true,
  async run({ prefix, args, user, server, db, track, findMember, isGuest, reply, replyEditable, ping, notHere }) {
    if (!user) return notHere();
    const usage = `Usage: \`${prefix}give <user> <amount>\` or \`${prefix}give <user> <item> [amount|all]\`, or \`${prefix}give off\` / \`${prefix}give on\` to stop or allow gifts to you`;
    const toggle = args.length === 1 && ['off', 'on'].includes(args[0].toLowerCase()) && args[0].toLowerCase();
    if (toggle) return reply(setGifts(prefix, db, server, user, toggle === 'off'));
    if (args.length < 2) return reply(usage);

    const { member, rest, query } = await splitTarget(findMember, args);
    if (!member) return reply(`I can't find anyone called **${query}** here.`);
    if (member.id === user.id) return reply("You can't give things to yourself.");
    if (member.id === server.client.user?.id) return reply("That's sweet, but I can't accept gifts.");
    if (await isGuest(member.id)) return reply("Guest accounts can't receive gifts.");

    const cents = rest.length === 1 ? parseCash(rest[0]) : null;
    if (db.giftsOff(server.key, member.id)) {
      return reply(`${pick(cents !== null ? BLOCKED_CASH : BLOCKED_ITEMS)} (**${member.name}** has turned off receiving gifts)`);
    }
    let gift;
    if (cents !== null) {
      if (cents < 1) return reply(usage);
      const have = db.cents(server.key, user.id);
      if (cents > have) return reply(`You only have ${formatMoney(have)}.`);
      gift = { cents, value: cents };
    } else {
      // One item at a time: no categories or "all" (too easy to give away everything).
      const word = rest[0].toLowerCase();
      if (rest.length === 1 && (word === 'all' || TIERS.has(word))) return reply(usage);
      const { lots, error, usage: badAmount } = choose(rest, db.items(server.key, user.id), { verb: 'given' });
      if (badAmount) return reply(usage);
      if (error) return reply(error);
      const theirs = placeOf(db, server.key, member.id, 'backpack');
      const room = theirs.space - theirs.used;
      if (room <= 0) return reply(`**${member.name}**'s Backpack is full (${theirs.used}/${theirs.space}).`);
      const { fits, left } = fit(lots, room);
      gift = { lots: fits, left, value: fits.reduce((sum, l) => sum + l.item.price * l.qty, 0) };
    }

    const moved = db.give(server.key, user.id, member.id,
      { cents: gift.cents, lots: gift.lots?.map((l) => ({ item: l.item.id, qty: l.qty })) }, gift.value);
    if (!moved) return reply(`Your ${gift.cents ? 'balance' : 'Backpack'} changed while I was counting. Try again.`);
    track.moved();

    const line = pick(gift.cents ? CASH : ITEMS);
    const edit = await replyEditable(line + DOTS[0]);
    for (const dots of DOTS.slice(1)) {
      await sleep(FRAME);
      await edit(line + dots, { quiet: true });
    }
    await sleep(FRAME);

    if (gift.cents) {
      await edit(`✅ Sent ${lost(gift.cents)} to ${member.name}.`);
      return ping(member, (mention) => `🎁 ${mention}, ${user.name} sent you ${gained(gift.cents)}.`);
    }
    const extra = gift.left ? ` ${gift.left} didn't fit in their Backpack.` : '';
    await edit(`✅ Gave ${describe(gift.lots)} to ${member.name}.${extra}`);
    return ping(member, (mention) => `🎁 ${mention}, ${user.name} gave you ${describe(gift.lots)}.`);
  },
};

function setGifts(prefix, db, server, user, off) {
  const changed = db.setGiftsOff(server.key, user.id, off);
  if (off) {
    return changed
      ? `🚫 Gifts are off: nobody can give you cash or items here. Turn them back on with \`${prefix}give on\`.`
      : `Gifts are already off. Turn them back on with \`${prefix}give on\`.`;
  }
  return changed ? '🎁 Gifts are on again: people can give you cash and items.' : 'Gifts are already on.';
}
