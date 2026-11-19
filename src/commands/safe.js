import { safeOf, placeOf, contents, choose, fit, describe } from '../storage.js';
import { sellFrom } from './sell.js';

// Your safe: valuables kept out of the Backpack, so it has room for more.
// A whole lot that doesn't fit moves as much as it can, most valuable first.
export default {
  name: 'safe',
  category: 'economy',
  usage: ['', '<item> [amount|all]', '<category>', 'take <item> [amount|all]', 'sell <item> [amount|all]'],
  description: 'your safe (buy one in the shop): put things in from your Backpack, take them out, or sell them from it; a category or `all` works too',
  cooldown: 5_000,
  economy: true,
  async run({ prefix, args, user, server, db, track, reply, notHere }) {
    if (!user) return notHere();
    const sub = args[0]?.toLowerCase();
    if (sub === 'sell') return sellFrom('safe', args.slice(1), { prefix, user, server, db, track, reply });

    const safe = safeOf(db, server.key, user.id);
    if (!args.length) {
      if (!safe) return reply(`You don't have a safe. Buy one in \`${prefix}shop\`.\n${guide(prefix)}`);
      const { rows, used, space } = placeOf(db, server.key, user.id, 'safe');
      return reply(`🔒 **${safe.name}** (${used}/${space}): ${contents(rows)}\n${guide(prefix)}`);
    }
    if (!safe) return reply(`You don't have a safe. Buy one in \`${prefix}shop\`.`);
    const take = sub === 'take';
    return move(take ? 'safe' : 'backpack', take ? 'backpack' : 'safe', take ? args.slice(1) : args, { prefix, user, server, db, reply, safe });
  },
};

// Every subcommand, shown under the safe's contents.
function guide(prefix) {
  return [
    '**Using your safe** (an item, a category like `legendary`, or `all`):',
    `\`${prefix}safe <item> [amount|all]\` · \`${prefix}safe <category>\` · \`${prefix}safe all\` put things in from your Backpack`,
    `\`${prefix}safe take <item> [amount|all]\` · \`${prefix}safe take <category>\` · \`${prefix}safe take all\` take them back out`,
    `\`${prefix}safe sell <item> [amount|all]\` · \`${prefix}safe sell <category>\` · \`${prefix}safe sell all\` sell straight from the safe (all keeps legendaries)`,
  ].join('\n');
}

function move(from, to, args, { prefix, user, server, db, reply, safe }) {
  const command = from === 'safe' ? 'safe take' : 'safe';
  const usage = `Usage: \`${prefix}${command} <item> [amount|all]\`, \`${prefix}${command} <category>\` or \`${prefix}${command} all\``;
  if (!args.length) return reply(usage);

  const source = placeOf(db, server.key, user.id, from);
  const dest = placeOf(db, server.key, user.id, to);
  const { lots, error, usage: badAmount } = choose(args, source.rows, { where: from === 'safe' ? ' in your safe' : '', verb: 'moved' });
  if (badAmount) return reply(usage);
  if (error) return reply(error);
  if (!lots.length) return reply(from === 'safe' ? 'Your safe is empty.' : 'Your Backpack is empty.');

  const room = dest.space - dest.used;
  if (room <= 0) {
    return reply(to === 'safe'
      ? `Your ${safe.name} is full (${dest.used}/${dest.space}). Sell something with \`${prefix}safe sell\`, or upgrade in \`${prefix}shop\`.`
      : `Your Backpack is full (${dest.used}/${dest.space}). Sell something first.`);
  }
  const { fits, left } = fit(lots, room);
  if (!db.move(server.key, user.id, fits.map((l) => ({ item: l.item.id, qty: l.qty })), from, to)) {
    return reply(`Your ${from === 'safe' ? 'safe' : 'Backpack'} changed while I was counting. Try again.`);
  }
  const now = dest.used + fits.reduce((n, l) => n + l.qty, 0);
  const rest = left ? ` ${left} didn't fit.` : '';
  return reply(to === 'safe'
    ? `🔒 Put ${describe(fits)} in your ${safe.name} (${now}/${dest.space}).${rest}`
    : `🎒 Took ${describe(fits)} out of your ${safe.name}. Backpack: ${now}/${dest.space}.${rest}`);
}
