import { formatMoney } from '../items.js';
import { KINDS, TOOLS, AMMO, LICENSES, PROMOS, toolById, ammoById, licenseById, rankOf, wear, breakable, matchTools } from '../tools.js';
import { BOOSTS, energyOf, boosted } from '../energy.js';
import { matchAnswer, optionsLine } from '../answers.js';
import { claimGame } from '../games.js';
import { formatWait } from '../duration.js';
import { green, gained, lost } from '../colors.js';
import { drawCharm, kickedIn } from '../charms.js';

// Trading in a tool when upgrading is worth half of what's left of it
// (guns and safes don't wear, so half their price).
const TRADE_IN = 0.5;
const tradeIn = (tool, uses) => Math.round(TRADE_IN * tool.price * (breakable(tool) ? Math.max(0, tool.max - uses) / tool.max : 1));

// A Coupon from the Pocket takes up to its cap off a purchase of `price`:
// `due` is what's left to pay, and `spend()` uses the Coupon up once the
// purchase went through, giving the line the reply starts with.
function couponFor(db, server, userId, price, track) {
  const drawn = drawCharm(db, server, userId, { use: 'buy', price });
  const off = drawn ? Math.min(price, drawn.charm.cap) : 0;
  return {
    due: price - off,
    spend() {
      if (!off) return '';
      drawn.use();
      track.earned('charms', off);
      return `${kickedIn(drawn.charm)} It took ${gained(off)} off.\n`;
    },
  };
}
const paid = (cents) => (cents ? lost(cents) : 'free');

export default {
  name: 'shop',
  category: 'economy',
  usage: ['', '<number|name>', 'promo <name>'],
  description: 'fishing poles, pickaxes, licenses, guns, ammo, safes, energy recovery, crew outfits and your promos; buy with `shop <number>` (or the item\'s name)',
  cooldown: 5_000,
  economy: true,
  // Browsing has its own cooldown, so looking never holds up buying.
  cooldownFor: (args) => (args.length ? null : { name: 'shop list', cooldown: 5_000 }),
  async run({ prefix, args, user, server, db, track, reply, notHere, awaitAnswer }) {
    if (!args.length) return reply(list(prefix, user, server, db));
    if (!user) return notHere();
    // Anything after ?shop is an item to buy, except "promo <name>".
    if (args[0].toLowerCase() === 'promo') {
      if (args.length === 1) return reply(`Usage: \`${prefix}shop promo <name>\``);
      return redeem(args.slice(1).join(' '), { user, server, db, track, reply });
    }
    return buy(args.join(' '), { prefix, user, server, db, track, reply, awaitAnswer });
  },
};

// Items are numbered 1, 2, 3… straight down the list, in this order (new
// sections go at the end, so the old numbers keep working).
const kind = (k) => TOOLS.filter((t) => t.kind === k);
const CREW = [...LICENSES.filter((l) => l.crew), ...kind('boat'), ...kind('mine_site'), ...kind('land')];
const STOCK = [...kind('pole'), ...kind('pickaxe'), ...LICENSES.filter((l) => !l.crew), ...kind('gun'), ...AMMO, ...kind('safe'), ...BOOSTS, ...CREW];
const numberOf = (item) => STOCK.indexOf(item) + 1;
const gives = (boost) => (boost.energy === Infinity ? 'full energy' : `+${boost.energy} energy`);
const gunFor = (ammo) => TOOLS.find((t) => t.ammo === ammo.id);
const a = (name) => (/^[aeiou]/i.test(name) ? 'an' : 'a');
const outfit = (t) => `room for ${t.crew === Infinity ? 'any number of' : t.crew} crew${t.perk ? ` · ${t.perk}` : ''}`;
const game = (gun) => (gun.big ? `small + big game (${gun.hospital}% hospital risk on big game)` : 'small game only');

// What someone already has (their tools, licenses and ammo with rounds
// left) is listed in green.
function owned(user, server, db) {
  if (!user) return new Set();
  return new Set([
    ...db.tools(server.key, user.id).map((t) => t.item),
    ...db.licenses(server.key, user.id),
    ...db.ammo(server.key, user.id).keys(),
  ]);
}

function list(prefix, user, server, db) {
  const mine = owned(user, server, db);
  const line = (item, text) => {
    const rest = `${item.name} · ${formatMoney(item.price)} · ${text}`;
    return `**${numberOf(item)}.** ${mine.has(item.id) ? green(rest) : rest}`;
  };
  const tools = (k) => kind(k).map((t) => line(t, `up to ${t.max} ${KINDS[k].unit}`));
  const promos = user ? PROMOS.filter((p) => !db.promoClaimed(server.key, user.id, p.id)) : [];
  // One section per category, so a long list splits between categories.
  return [
    [`**Shop** (buy with \`${prefix}shop <number>\`, e.g. \`${prefix}shop 1\`)`, '🟢 = Items you have'],
    [`${KINDS.pole.emoji} **Fishing poles**`, ...tools('pole')],
    [`${KINDS.pickaxe.emoji} **Pickaxes**`, ...tools('pickaxe')],
    ['🪪 **Licenses** (yours for good)', ...LICENSES.filter((l) => !l.crew).map((l) => line(l, `needed ${l.needed}`))],
    [`${KINDS.gun.emoji} **Guns** (never break; 1 round a hunt)`, ...kind('gun').map((g) => line(g, game(g)))],
    ['📦 **Ammo**', ...AMMO.map((a) => line(a, `${a.rounds} rounds for the ${gunFor(a).name}`))],
    [`${KINDS.safe.emoji} **Safes** (room for things outside your Backpack)`, ...kind('safe').map((t) => line(t, `holds ${t.space.toLocaleString('en-US')} items`))],
    ['⚡ **Recovery** (used right away, one an hour)', ...BOOSTS.map((b) => line(b, gives(b)))],
    [`👷 **Crew** (see \`${prefix}crew\`; 2 crew per job without an outfit, each perk adds to the last)`,
      ...LICENSES.filter((l) => l.crew).map((l) => line(l, `needed ${l.needed}`)),
      ...['boat', 'mine_site', 'land'].flatMap((k) => kind(k).map((t) => line(t, `${KINDS[k].emoji} ${outfit(t)}`)))],
    ...(promos.length ? [['🎁 **Your promos**', ...promos.map((p) => `\`${prefix}shop promo ${p.id}\` ${p.label}`)]] : []),
  ].map((section) => section.join('\n'));
}

// By number, or by name. A name that fits several items (a store selling
// more than one thing) asks which one instead of guessing.
function buy(text, { prefix, user, server, db, track, reply, awaitAnswer }) {
  let tool;
  if (/^\d+$/.test(text)) {
    tool = STOCK[Number(text) - 1];
    if (!tool) return reply(`There's no item number ${Number(text)} in the shop.`);
  } else {
    const found = matchTools(text, STOCK);
    if (!found.length) return reply(`There's no item called **${text}** in the shop.`);
    if (found.length > 1) {
      return reply(`Which one? ${found.map((t) => `**${numberOf(t)}.** ${t.name}`).join(', ')} (buy with \`${prefix}shop <number>\`)`);
    }
    [tool] = found;
  }
  if (BOOSTS.includes(tool)) return buyBoost(tool, { user, server, db, track, reply, awaitAnswer });
  if (LICENSES.includes(tool)) return buyLicense(tool, { user, server, db, track, reply });
  if (AMMO.includes(tool)) return buyAmmo(tool, { prefix, user, server, db, track, reply });
  const { noun } = KINDS[tool.kind];
  const held = db.tool(server.key, user.id, tool.kind);
  const current = held && toolById.get(held.item);

  if (current?.id === tool.id) return reply(`You already have ${a(tool.name)} ${tool.name}${breakable(tool) ? ` (${wear(tool.kind, held.uses)})` : ''}.`);
  if (current && rankOf(current) > rankOf(tool)) return reply(`You already have a better ${noun}: ${current.name}.`);
  if (tool.kind === 'gun' && !db.licenses(server.key, user.id).includes('gun_license')) {
    return reply(`You need a Gun License to buy a gun. It's number ${numberOf(licenseById.get('gun_license'))} in the shop.`);
  }

  // An upgrade: the old tool is traded in for part of the price. A gun's
  // leftover ammo (which won't fit the new one) goes with it, at half price too.
  const rounds = current?.kind === 'gun' ? db.ammo(server.key, user.id).get(current.ammo) ?? 0 : 0;
  const ammo = current?.kind === 'gun' && ammoById.get(current.ammo);
  const credit = current ? tradeIn(current, held.uses) + (rounds ? Math.round(TRADE_IN * rounds * ammo.price / ammo.rounds) : 0) : 0;
  const cost = Math.max(0, tool.price - credit);
  const coupon = couponFor(db, server.key, user.id, cost, track);
  const balance = db.cents(server.key, user.id);
  const bought = tool.kind === 'gun' ? db.buyGun(server.key, user.id, tool.id, coupon.due) : db.buyTool(server.key, user.id, tool.kind, tool.id, coupon.due);
  if (!bought) return reply(`That costs ${formatMoney(coupon.due)}. You only have ${formatMoney(balance)}.`);
  track.lost('shop', cost);
  const charmed = coupon.spend();
  const now = formatMoney(db.cents(server.key, user.id));
  const old = rounds ? `${current.name} (and ${rounds} ${rounds === 1 ? 'round' : 'rounds'})` : current?.name;
  return reply(charmed + (credit
    ? `🛒 You traded in your ${old} for ${gained(credit)} and bought ${a(tool.name)} ${tool.name} for ${paid(coupon.due)}. You now have ${now}.`
    : `🛒 You bought ${a(tool.name)} ${tool.name} for ${paid(coupon.due)}. You now have ${now}.`));
}

function buyLicense(license, { user, server, db, track, reply }) {
  const name = license.crew ? license.name : `a ${license.name}`;
  if (db.licenses(server.key, user.id).includes(license.id)) return reply(`You already have ${name}.`);
  const coupon = couponFor(db, server.key, user.id, license.price, track);
  const balance = db.cents(server.key, user.id);
  if (!db.buyLicense(server.key, user.id, license.id, coupon.due)) {
    return reply(`That costs ${formatMoney(coupon.due)}. You only have ${formatMoney(balance)}.`);
  }
  track.lost('shop', license.price);
  return reply(`${coupon.spend()}🪪 You bought ${name} for ${paid(coupon.due)}. You now have ${formatMoney(db.cents(server.key, user.id))}.`);
}

// Ammo only for the gun someone has: anything else wouldn't fit it.
function buyAmmo(ammo, { prefix, user, server, db, track, reply }) {
  const gun = toolById.get(db.tool(server.key, user.id, 'gun')?.item);
  if (!gun) return reply(`That's ammo for the ${gunFor(ammo).name}, and you don't have a gun. Check \`${prefix}shop\`.`);
  if (gun.ammo !== ammo.id) return reply(`That won't fit your ${gun.name}. It takes ${ammoById.get(gun.ammo).name} (number ${numberOf(ammoById.get(gun.ammo))}).`);
  const coupon = couponFor(db, server.key, user.id, ammo.price, track);
  const balance = db.cents(server.key, user.id);
  if (!db.buyAmmo(server.key, user.id, ammo.id, ammo.rounds, coupon.due)) {
    return reply(`That costs ${formatMoney(coupon.due)}. You only have ${formatMoney(balance)}.`);
  }
  track.lost('shop', ammo.price);
  const rounds = db.ammo(server.key, user.id).get(ammo.id);
  return reply(`${coupon.spend()}📦 You bought ${ammo.rounds} rounds of ${ammo.name} for ${paid(coupon.due)} (${rounds} now). You now have ${formatMoney(db.cents(server.key, user.id))}.`);
}

const YES_NO = { y: 'yes', yeah: 'yes', yep: 'yes', sure: 'yes', ok: 'yes', okay: 'yes', n: 'no', nah: 'no', nope: 'no' };

// Recovery items are used on the spot. One that would top the bar past its
// max asks first, since the extra is lost.
async function buyBoost(boost, { user, server, db, track, reply, awaitAnswer }) {
  let coupon = couponFor(db, server.key, user.id, boost.price, track);
  const refused = (bar) => {
    if (bar.boostIn) return `You've had a recovery item in the last hour. Your next one is ready in ${formatWait(bar.boostIn)}.`;
    if (bar.points >= bar.max) return `Your energy is already full (${bar.max}/${bar.max}).`;
    const balance = db.cents(server.key, user.id);
    return balance < coupon.due ? `That costs ${formatMoney(coupon.due)}. You only have ${formatMoney(balance)}.` : null;
  };
  let bar = energyOf(db, server.key, user.id);
  if (refused(bar)) return reply(refused(bar));

  const { wasted } = boosted(bar, boost);
  if (wasted) {
    const release = claimGame(server.key, user.id);
    if (!release) return;
    try {
      await reply(`You're at ${bar.points}/${bar.max} energy, so ${wasted} of its ${boost.energy} would go to waste. Buy the ${boost.name} anyway?\n${optionsLine(['yes', 'no'])}`);
      const answer = (text) => matchAnswer(text, ['yes', 'no'], YES_NO);
      const said = await awaitAnswer((text) => answer(text) !== null, 15_000);
      if (!said) return reply('⌛ Timed out, so not buying it.');
      if (answer(said) === 'no') return reply('Okay, not buying it.');
    } finally {
      release();
    }
    // Things may have changed while they thought about it (the Coupon spent, even).
    bar = energyOf(db, server.key, user.id);
    coupon = couponFor(db, server.key, user.id, boost.price, track);
    if (refused(bar)) return reply(refused(bar));
  }

  const now = Date.now();
  const { points } = boosted(bar, boost);
  if (!db.buyBoost(server.key, user.id, coupon.due, points, points >= bar.max ? now : bar.since, now)) return reply(refused(bar));
  track.lost('shop', boost.price);
  return reply(`${coupon.spend()}⚡ You bought ${/^[aeiou]/i.test(boost.name) ? 'an' : 'a'} ${boost.name} for ${paid(coupon.due)}. Energy: ${points}/${bar.max}. You now have ${formatMoney(db.cents(server.key, user.id))}.`);
}

function redeem(text, { user, server, db, track, reply }) {
  const id = matchAnswer(text, PROMOS.map((p) => p.id));
  const promo = PROMOS.find((p) => p.id === id);
  if (!promo) return reply(`There's no promo called **${text}**.`);
  if (db.promoClaimed(server.key, user.id, promo.id)) return reply('You already claimed that promo.');

  const tool = toolById.get(promo.tool);
  const held = db.tool(server.key, user.id, tool.kind);
  const current = held && toolById.get(held.item);
  // Only one tool of a kind: someone who already has one gets its price instead.
  if (current) {
    if (!db.claimPromoCash(server.key, user.id, promo.id, tool.price)) return reply('You already claimed that promo.');
    track.earned('promos', tool.price);
    const better = rankOf(current) > rankOf(tool) ? 'better ' : '';
    return reply(`🎁 You already have a ${better}${KINDS[tool.kind].noun}, so here's ${gained(tool.price)} instead! You now have ${formatMoney(db.cents(server.key, user.id))}.`);
  }
  if (!db.claimPromoTool(server.key, user.id, promo.id, tool.kind, tool.id)) return reply('You already claimed that promo.');
  return reply(`🎁 Enjoy your free ${tool.name}! ${promo.message}`);
}
