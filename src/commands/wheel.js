import { randomInt } from 'node:crypto';
import { ITEMS, itemById, formatMoney } from '../items.js';
import { WHEELS } from '../wheel.js';
import { spinGif, REVEAL, BUSY } from '../wheel-gif.js';
import { claimGame } from '../games.js';
import { placeOf } from '../storage.js';
import { hospitalize, takeable, billLine } from '../hospital.js';
import { surge, energyOf } from '../energy.js';
import { charmsOf, givesCharm, charmName, TYPES, SEVERITIES } from '../charms.js';
import { gained, lost, green, red } from '../colors.js';
import { formatWait } from '../duration.js';

// Two free spins every 24 hours (counted from the first one), then paid
// spins on a harsher wheel: $5,000, doubling with each one until the free
// spins come back. Everything a spin does happens before the GIF is posted;
// the result is told once the wheel has stopped.
const DAY = 86_400_000;
const FREE = 2;
const PAID = 500_000; // $5,000, doubled for each paid spin already bought today
const priceOf = (bought) => PAID * 2 ** bought;
const stamp = (ms) => Math.ceil(ms / 1000);
// Money lost to the wheel is collected like a hospital bill (cash, then
// items, the rest forgiven), so keeping your cash low doesn't dodge it.
const DEBT = { title: 'You owe', by: 'the debt collector' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Said only when the spin's GIF isn't drawn yet (it takes a few seconds).
export const GENERATING = '🎡 Generating... please wait a few seconds.';

// Someone's wheel day: { since (null before the first free spin), free, paid }.
function dayOf(db, server, userId, now) {
  const row = db.wheelSpins(server, userId);
  if (!row || now - row.since >= DAY) return { since: null, free: 0, paid: 0 };
  return { since: row.since, free: row.free_used, paid: row.paid };
}

export default {
  name: 'wheel',
  aliases: ['spin'],
  category: 'economy',
  usage: ['', 'paid', 'odds'],
  description: 'spin the wheel: 2 free spins every 24 hours, then paid spins on a riskier wheel ($5,000, doubling each time); `odds` shows every slice',
  cooldown: 5_000,
  economy: true,
  async run({ cmd, prefix, args, user, server, db, cooldowns, track, reply, replyImageOnce, notHere }) {
    const sub = args[0]?.toLowerCase();
    if (sub === 'odds') return reply(odds());
    if (args.length && !['paid', 'buy'].includes(sub)) return reply(`Usage: \`${prefix}wheel\`, \`${prefix}wheel paid\` or \`${prefix}wheel odds\``);
    if (!user) return notHere();
    const release = claimGame(server.key, user.id);
    if (!release) return;
    try {
      return await play({ paid: !!sub, cmd, prefix, user, server, db, cooldowns, track, reply, replyImageOnce });
    } finally {
      release();
    }
  },
};

async function play({ paid, cmd, prefix, user, server, db, cooldowns, track, reply, replyImageOnce }) {
  const now = Date.now();
  const day = dayOf(db, server.key, user.id, now);
  const price = priceOf(day.paid);
  const back = day.since ? `<t:${stamp(day.since + DAY)}:R>` : null;
  if (paid && day.free < FREE) {
    const left = FREE - day.free;
    return reply(`You still have ${left} free spin${left === 1 ? '' : 's'}: use \`${prefix}wheel\`.`);
  }
  if (!paid && day.free >= FREE) {
    return reply(`🎡 You've used both free spins. They come back ${back}. A paid spin costs **${formatMoney(price)}**: \`${prefix}wheel paid\` (riskier wheel, bigger prizes; \`${prefix}wheel odds\`).`);
  }

  const name = paid ? 'paid' : 'free';
  // The GIF first: if drawing it fails, nothing has been spent.
  let index = randomInt(WHEELS[name].length);
  const waiting = () => reply(GENERATING);
  let gif = await spinGif(name, index, waiting);
  if (!gif) {
    // Too many spins being drawn right now: nothing is spent, not even the cooldown.
    cooldowns.setRemaining(server.key, cmd, user.id, 0);
    return reply(BUSY);
  }
  if (paid) {
    const balance = db.cents(server.key, user.id);
    if (!db.buyWheelSpin(server.key, user.id, price, day.since, day.free, day.paid + 1)) {
      return reply(`A paid spin costs **${formatMoney(price)}**. You only have ${formatMoney(balance)}.`);
    }
    track.lost('wheel', price);
  } else {
    db.setWheelSpins(server.key, user.id, day.since ?? now, day.free + 1, day.paid);
  }

  const after = dayOf(db, server.key, user.id, Date.now());
  const footer = paid
    ? `\nYour next paid spin costs ${formatMoney(priceOf(after.paid))} (back to free spins <t:${stamp(after.since + DAY)}:R>).`
    : after.free < FREE ? '\nYou have 1 free spin left today.'
      : `\nThat was your last free spin: they come back <t:${stamp(after.since + DAY)}:R>. Can't wait? The paid wheel has bigger prizes (and bigger risks): \`${prefix}wheel paid\` for ${formatMoney(priceOf(after.paid))}.`;

  // A spin, its result, and again while it keeps landing on "spin again".
  for (;;) {
    const result = land(WHEELS[name][index], { server, user, db, track });
    await show(gif, replyImageOnce);
    if (!result.again) return reply(`${result.text}${footer}`);
    await reply(`${result.text} Here it goes...`);
    index = randomInt(WHEELS[name].length);
    gif = await spinGif(name, index, waiting);
  }
}

// Posts the spin and waits for it to stop. The spin has already happened,
// so if there's no GIF (a "spin again" while drawing is busy) or it can't be
// posted, the result is told straight away instead.
export async function show(gif, replyImageOnce) {
  if (!gif) return;
  try {
    await replyImageOnce(gif.key, gif.gif, 'wheel.gif', 'image/gif');
  } catch (err) {
    console.error('Wheel GIF failed to post:', err);
    return;
  }
  await sleep(REVEAL);
}

// Does what a slice says: { text, again }.
function land(slice, ctx) {
  const { server, user, db, track } = ctx;
  const cash = () => db.cents(server.key, user.id);
  const take = (cents) => { const taken = db.takeUpTo(server.key, user.id, cents); track.lost('wheel', taken); return taken; };
  const collect = (cents) => {
    const paid = db.payBill(server.key, user.id, cents, takeable);
    track.lost('wheel', cents - paid.forgiven);
    return billLine({ bill: cents, ...paid }, DEBT);
  };
  const give = (cents) => { db.addCents(server.key, user.id, cents); track.earned('wheel', cents); };

  switch (slice.kind) {
    case 'cash':
      give(slice.cents);
      return { text: `${slice.emoji} You won ${gained(slice.cents)}!${slice.cents >= 1_000_000 ? ' **JACKPOT!**' : ''}` };
    case 'lose':
      return { text: `💸 You lost a bet with a stranger. ${collect(slice.cents)}` };
    case 'flip':
      if (randomInt(2)) { give(slice.cents); return { text: `🪙 The coin says heads: ${gained(slice.cents)}!` }; }
      return { text: `🪙 The coin says tails. ${collect(slice.cents)}` };
    case 'irs': {
      const owed = Math.min(Math.round(cash() * slice.rate), slice.max);
      const taken = owed ? take(owed) : 0;
      return { text: taken ? `🧾 IRS audit! They took ${lost(taken)} (${Math.round(slice.rate * 100)}% of your cash, ${formatMoney(slice.max)} at most).` : '🧾 The IRS audited you and felt sorry for you. Lucky escape!' };
    }
    case 'snake': {
      const paid = hospitalize(db, server.key, user.id, slice.scale);
      track.lost('wheel', paid.bill - paid.forgiven);
      return { text: `🐍 A snake bit you. ${billLine(paid)}` };
    }
    case 'hospital': {
      const paid = hospitalize(db, server.key, user.id);
      track.lost('wheel', paid.bill - paid.forgiven);
      return { text: `🏥 You fell off the wheel. ${billLine(paid)}` };
    }
    case 'pickpocket': {
      // A random item from the Backpack (every one equally likely), never a legendary.
      const units = db.items(server.key, user.id).flatMap((r) => (stealable(r.item) ? Array(r.qty).fill(r.item) : []));
      if (!units.length) return { text: '🥷 A pickpocket rummaged through your Backpack, found nothing worth taking and left. Lucky escape!' };
      return { text: `🥷 A pickpocket got you: ${steal(units[randomInt(units.length)], ctx)}.` };
    }
    case 'robbed': {
      // Your most valuable Backpack item that isn't a legendary (a safe keeps things safe).
      const best = db.items(server.key, user.id).filter((r) => stealable(r.item))
        .sort((a, b) => itemById.get(b.item).price - itemById.get(a.item).price)[0];
      if (!best) return { text: '🦹 A robber went through your Backpack and found nothing worth taking. Lucky escape!' };
      return { text: `🦹 You got robbed: ${steal(best.item, ctx)}. A safe would have kept it safe.` };
    }
    case 'items': {
      const pool = ITEMS.filter((i) => i.tier === slice.tier && !i.retired && i.from);
      const lines = [];
      for (let n = 0; n < slice.count; n++) {
        const item = pool[randomInt(pool.length)];
        const { used, space } = placeOf(db, server.key, user.id, 'backpack');
        track.earned('wheel', item.price);
        if (used < space) {
          db.addItem(server.key, user.id, item.id);
          lines.push(`${item.emoji} **${item.name}** (${item.tier})`);
        } else {
          db.addCents(server.key, user.id, item.price);
          lines.push(`${item.emoji} **${item.name}**, but your Backpack is full, so you got ${gained(item.price)} for it instead`);
        }
      }
      return { text: `${slice.emoji} You won ${lines.join(' and ')}!` };
    }
    case 'surge': {
      surge(db, server.key, user.id);
      const bar = energyOf(db, server.key, user.id);
      return { text: `⚡ Energy Surge! Your energy max is ${bar.max} for 12 hours, and it's full right now.` };
    }
    case 'jail': {
      const now = Date.now();
      const until = Math.max(now, db.jailedUntil(server.key, user.id)) + slice.ms;
      db.jail(server.key, user.id, until);
      return { text: `🚔 Jail! No economy commands for ${formatWait(slice.ms)} (out <t:${stamp(until)}:R>). \`?stats\` still works.` };
    }
    case 'charm': {
      const pool = charmsOf(slice.type, slice.severity);
      const charm = pool[randomInt(pool.length)];
      givesCharm(db, server.key, user.id, charm);
      const [severity, paint] = SEVERITIES[slice.type][slice.severity];
      return { text: `${TYPES[slice.type].emoji} You got a ${paint(severity)} ${TYPES[slice.type].label.toLowerCase()}: ${charm.emoji} ${charmName(charm)}! ${charm.text}` };
    }
    case 'wild': {
      const option = slice.options[randomInt(slice.options.length)];
      const inner = land(option, ctx);
      return { text: `🃏 Wild card... it's ${option.name}! ${inner.text}`, again: inner.again };
    }
    case 'again':
      return { text: '🔄 Spin again, on the house!', again: true };
    default:
      throw new Error(`Unknown wheel slice: ${slice.kind}`);
  }
}

// Whether a thief can take it: anything in the Backpack but legendaries and retired items.
const stealable = (id) => { const item = itemById.get(id); return item && !item.retired && item.tier !== 'legendary'; };

// Takes one of an item (worth counted as lost) and names it.
function steal(id, { server, user, db, track }) {
  const item = itemById.get(id);
  db.takeItem(server.key, user.id, id);
  track.lost('wheel', item.price);
  return `they took your ${item.emoji} **${item.name}** (worth ${lost(item.price)})`;
}

// ?wheel odds: every slice of both wheels with its chance, grouped by kind,
// good outcomes in green and bad ones in red (gambles stay plain). No emojis
// on the lines: owner's call, it was too much.
const GROUPS = [
  ['Money', ['cash', 'lose', 'irs', 'flip']],
  ['Charms', ['charm']],
  ['Items & perks', ['items', 'surge', 'again', 'wild']],
  ['Bad luck', ['snake', 'hospital', 'pickpocket', 'robbed', 'jail']],
];
function odds() {
  const describe = (s) => ({
    cash: () => [green, formatMoney(s.cents)],
    lose: () => [red, `Lose ${formatMoney(s.cents)} (cash first, then items)`],
    irs: () => [red, `IRS audit: ${Math.round(s.rate * 100)}% of your cash, up to ${formatMoney(s.max)}`],
    flip: () => [String, `Coin flip: win or lose ${formatMoney(s.cents)}`],
    charm: () => [s.type === 'lucky' ? green : red, `${SEVERITIES[s.type][s.severity][0]} ${TYPES[s.type].label.toLowerCase()}`],
    items: () => [green, s.count > 1 ? `${s.count} ${s.tier} items` : `${/^[aeiou]/.test(s.tier) ? 'An' : 'A'} ${s.tier} item`],
    surge: () => [green, 'Energy Surge: double energy max for 12 hours'],
    again: () => [green, 'Spin again'],
    wild: () => [String, `Wild card: ${s.options.map((o) => o.name).join(', ')}`],
    snake: () => [red, `Snake bite: a hospital bill, ${s.scale * 100}% of a hunting one`],
    hospital: () => [red, 'Hospital: a hunting-sized hospital bill'],
    pickpocket: () => [red, 'Thief: lose a random Backpack item (never a legendary)'],
    robbed: () => [red, 'Robbed: lose your best Backpack item (never a legendary)'],
    jail: () => [red, `Jail for ${s.ms / 60_000} minutes`],
  })[s.kind]();
  // Good first, then gambles, then bad, within each group.
  const order = (paint) => (paint === green ? 0 : paint === red ? 2 : 1);
  const section = (title, slices) => {
    const lines = [title];
    for (const [group, kinds] of GROUPS) {
      const counts = new Map();
      // Biggest amounts first.
      for (const s of slices.filter((x) => kinds.includes(x.kind)).sort((a, b) => (b.cents ?? 0) - (a.cents ?? 0))) {
        const [paint, text] = describe(s);
        const seen = counts.get(text) ?? { paint, n: 0 };
        seen.n += 1;
        counts.set(text, seen);
      }
      if (!counts.size) continue;
      const rows = [...counts].sort((a, b) => order(a[1].paint) - order(b[1].paint))
        .map(([text, { paint, n }]) => `${paint(text)} · ${(n / slices.length) * 100}%`);
      lines.push(`**${group}**`, ...rows);
    }
    return lines.join('\n');
  };
  return [
    section('🎡 **Free wheel** (2 free spins every 24 hours)', WHEELS.free),
    section('🎰 **Paid wheel** ($5,000, doubling each spin until your free spins are back)', WHEELS.paid),
  ];
}
