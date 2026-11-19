import { formatMoney } from '../items.js';
import { KINDS, TOOLS, PROMOS, toolById, rankOf, wear, matchTools } from '../tools.js';
import { BOOSTS, energyOf, boosted } from '../energy.js';
import { matchAnswer, optionsLine } from '../answers.js';
import { claimGame } from '../games.js';
import { formatWait } from '../duration.js';

// Trading in a tool when upgrading is worth half of what's left of it.
const TRADE_IN = 0.5;
const tradeIn = (tool, uses) => Math.round(TRADE_IN * tool.price * (Math.max(0, tool.max - uses) / tool.max));

export default {
  name: 'shop',
  category: 'economy',
  usage: ['', '<number|name>', 'promo <name>'],
  description: 'fishing poles, pickaxes, energy recovery and your promos; buy with `shop <number>` (or the item\'s name)',
  cooldown: 5_000,
  economy: true,
  // Browsing has its own cooldown, so looking never holds up buying.
  cooldownFor: (args) => (args.length ? null : { name: 'shop list', cooldown: 5_000 }),
  async run({ prefix, args, user, server, db, reply, notHere, awaitAnswer }) {
    if (!args.length) return reply(list(prefix, user, server, db));
    if (!user) return notHere();
    // Anything after ?shop is an item to buy, except "promo <name>".
    if (args[0].toLowerCase() === 'promo') {
      if (args.length === 1) return reply(`Usage: \`${prefix}shop promo <name>\``);
      return redeem(args.slice(1).join(' '), { user, server, db, reply });
    }
    return buy(args.join(' '), { prefix, user, server, db, reply, awaitAnswer });
  },
};

// Items are numbered 1, 2, 3… straight down the list (poles, pickaxes, then recovery).
const STOCK = [...TOOLS, ...BOOSTS];
const numberOf = (item) => STOCK.indexOf(item) + 1;
const gives = (boost) => (boost.energy === Infinity ? 'full energy' : `+${boost.energy} energy`);

function list(prefix, user, server, db) {
  const section = (kind, title) => [
    `${KINDS[kind].emoji} **${title}**`,
    ...TOOLS.filter((t) => t.kind === kind)
      .map((t) => `**${numberOf(t)}.** ${t.name} · ${formatMoney(t.price)} · up to ${t.max} ${KINDS[kind].unit}`),
  ];
  const promos = user ? PROMOS.filter((p) => !db.promoClaimed(server.key, user.id, p.id)) : [];
  return [
    `**Shop** (buy with \`${prefix}shop <number>\`, e.g. \`${prefix}shop 1\`)`,
    ...section('pole', 'Fishing poles'),
    ...section('pickaxe', 'Pickaxes'),
    '⚡ **Recovery** (used right away, one an hour)',
    ...BOOSTS.map((b) => `**${numberOf(b)}.** ${b.name} · ${formatMoney(b.price)} · ${gives(b)}`),
    ...(promos.length ? ['🎁 **Your promos**', ...promos.map((p) => `\`${prefix}shop promo ${p.id}\` ${p.label}`)] : []),
  ].join('\n');
}

// By number, or by name. A name that fits several items (a store selling
// more than one thing) asks which one instead of guessing.
function buy(text, { prefix, user, server, db, reply, awaitAnswer }) {
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
  if (BOOSTS.includes(tool)) return buyBoost(tool, { user, server, db, reply, awaitAnswer });
  const { noun } = KINDS[tool.kind];
  const held = db.tool(server.key, user.id, tool.kind);
  const current = held && toolById.get(held.item);

  if (current?.id === tool.id) return reply(`You already have a ${tool.name} (${wear(tool.kind, held.uses)}).`);
  if (current && rankOf(current) > rankOf(tool)) return reply(`You already have a better ${noun}: ${current.name}.`);

  // An upgrade: the old tool is traded in for part of the price.
  const credit = current ? tradeIn(current, held.uses) : 0;
  const cost = tool.price - credit;
  const balance = db.cents(server.key, user.id);
  if (!db.buyTool(server.key, user.id, tool.kind, tool.id, cost)) {
    return reply(`That costs ${formatMoney(cost)}. You only have ${formatMoney(balance)}.`);
  }
  const now = formatMoney(db.cents(server.key, user.id));
  return reply(credit
    ? `🛒 You traded in your ${current.name} for ${formatMoney(credit)} and bought a ${tool.name} for ${formatMoney(cost)}. You now have ${now}.`
    : `🛒 You bought a ${tool.name} for ${formatMoney(cost)}. You now have ${now}.`);
}

const YES_NO = { y: 'yes', yeah: 'yes', yep: 'yes', sure: 'yes', ok: 'yes', okay: 'yes', n: 'no', nah: 'no', nope: 'no' };

// Recovery items are used on the spot. One that would top the bar past its
// max asks first, since the extra is lost.
async function buyBoost(boost, { user, server, db, reply, awaitAnswer }) {
  const refused = (bar) => {
    if (bar.boostIn) return `You've had a recovery item in the last hour. Your next one is ready in ${formatWait(bar.boostIn)}.`;
    if (bar.points >= bar.max) return `Your energy is already full (${bar.max}/${bar.max}).`;
    const balance = db.cents(server.key, user.id);
    return balance < boost.price ? `That costs ${formatMoney(boost.price)}. You only have ${formatMoney(balance)}.` : null;
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
    // Things may have changed while they thought about it.
    bar = energyOf(db, server.key, user.id);
    if (refused(bar)) return reply(refused(bar));
  }

  const now = Date.now();
  const { points } = boosted(bar, boost);
  if (!db.buyBoost(server.key, user.id, boost.price, points, points >= bar.max ? now : bar.since, now)) return reply(refused(bar));
  return reply(`⚡ You bought ${/^[aeiou]/i.test(boost.name) ? 'an' : 'a'} ${boost.name} for ${formatMoney(boost.price)}. Energy: ${points}/${bar.max}. You now have ${formatMoney(db.cents(server.key, user.id))}.`);
}

function redeem(text, { user, server, db, reply }) {
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
    const better = rankOf(current) > rankOf(tool) ? 'better ' : '';
    return reply(`🎁 You already have a ${better}${KINDS[tool.kind].noun}, so here's ${formatMoney(tool.price)} instead! You now have ${formatMoney(db.cents(server.key, user.id))}.`);
  }
  if (!db.claimPromoTool(server.key, user.id, promo.id, tool.kind, tool.id)) return reply('You already claimed that promo.');
  return reply(`🎁 Enjoy your free ${tool.name}! ${promo.message}`);
}
