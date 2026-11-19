import { randomInt } from 'node:crypto';
import { formatMoney } from '../items.js';
import { claimGame } from '../games.js';
import { findTarget } from '../members.js';
import { matchAnswer, optionsLine } from '../answers.js';
import { green, red, gained, lost } from '../colors.js';

const MIN = 10_000; // $100; there's no maximum
const TIME = 10_000;
const TIMEOUT_PENALTY = 0.05;
const TIMEOUT_COOLDOWN = 30_000;

// Every game is fair: a win pays back exactly 1 ÷ the chance of winning
// (rock paper scissors refunds ties, which is what keeps 2× fair there).
// Havoc's side is drawn with crypto.randomInt before the player answers.
const GAMES = {
  coin: {
    chance: 1 / 2,
    odds: '1 in 2 to win · pays 2×',
    ask: 'Heads or tails?',
    options: ['heads', 'tails'],
    aliases: { h: 'heads', t: 'tails' },
    draw: () => ['heads', 'tails'][randomInt(2)],
    // [result, line]: result is 'win', 'lose' or 'tie'
    judge: (pick, mine) => [pick === mine ? 'win' : 'lose', `🪙 It's **${mine}**! You picked ${pick}.`],
    pays: 2,
    cooldown: { win: 10_000, lose: 10_000 },
  },
  rps: {
    chance: 1 / 3,
    odds: '1 in 3 to win, 1 in 3 tie (wager back) · pays 2×',
    ask: 'Rock, paper, scissors and shoot.....',
    options: ['rock', 'paper', 'scissors'],
    aliases: { r: 'rock', p: 'paper', s: 'scissors', scissor: 'scissors' },
    draw: () => ['rock', 'paper', 'scissors'][randomInt(3)],
    judge: (pick, mine) => {
      const icon = { rock: '✊', paper: '📄', scissors: '✂️' };
      const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      const result = pick === mine ? 'tie' : beats[pick] === mine ? 'win' : 'lose';
      return [result, `You picked ${icon[pick]} **${pick}**, I picked ${icon[mine]} **${mine}**.`];
    },
    pays: 2,
    cooldown: { win: 10_000, lose: 10_000, tie: 5_000 },
  },
  dice: {
    chance: 1 / 6,
    odds: '1 in 6 to win · pays 6×',
    ask: 'Pick a number from 1 to 6!',
    options: ['1', '2', '3', '4', '5', '6'],
    aliases: { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6' },
    draw: () => String(randomInt(1, 7)),
    judge: (pick, mine) => [pick === mine ? 'win' : 'lose', `🎲 You picked **${pick}**, I rolled **${mine}**.`],
    pays: 6,
    cooldown: { win: 30_000, lose: 30_000 },
  },
};
const ALIASES = { coin: 'coin', flip: 'coin', coinflip: 'coin', rps: 'rps', dice: 'dice', roll: 'dice' };
// ?bet on its own (or a mistake) and ?bet record each have a short cooldown
// of their own, so looking things up never holds up a bet (or the other way).
const LOOKUP = (name) => ({ name, cooldown: 5_000, cooldownText: (wait) => `One sec! Try again in ${wait}.` });
const INFO = LOOKUP('bet info');
const RECORD = LOOKUP('bet record');
const LUCK_AFTER = 10; // answered bets before luck means anything

// "$250", "250", "250.50", or all/max (their whole balance).
function parseAmount(text, balance) {
  if (/^(all|max)$/i.test(text)) return balance;
  const m = /^\$?(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : null;
}

export default {
  name: 'bet',
  category: 'economy',
  usage: ['', '<coin|rps|dice> <amount|all>', 'record [@user]'],
  description: `bet $100 or more on a fair game; \`bet\` alone lists the games and their odds, \`bet record\` shows your stats`,
  cooldown: 10_000,
  cooldownText: (wait) => `Catch your breath! Your next bet is ready in ${wait}.`,
  economy: true,
  cooldownFor: (args) => (args[0]?.toLowerCase() === 'record' ? RECORD : ALIASES[args[0]?.toLowerCase()] && args.length === 2 ? null : INFO),
  async run({ cmd, prefix, args, user, server, db, cooldowns, track, findMember, awaitAnswer, replyEditable, reply, notHere }) {
    if (args[0]?.toLowerCase() === 'record') return showRecord({ args: args.slice(1), user, server, db, findMember, reply, notHere });
    const name = ALIASES[args[0]?.toLowerCase()];
    if (!name || args.length !== 2) {
      const lines = Object.entries(GAMES).map(([n, g]) => `\`${prefix}bet ${n} <amount>\` ${g.odds}`);
      return reply(`**Games** (bet ${formatMoney(MIN)} or more, answer within 10 seconds)\n${lines.join('\n')}`);
    }
    if (!user) return notHere();
    const game = GAMES[name];
    const release = claimGame(server.key, user.id);
    if (!release) return;
    try {
      return await play({ game, name, cmd, prefix, args, user, server, db, cooldowns, track, awaitAnswer, replyEditable, reply });
    } finally {
      release();
    }
  },
};

async function play({ game, name, cmd, prefix, args, user, server, db, cooldowns, track, awaitAnswer, replyEditable, reply }) {
  const balance = db.cents(server.key, user.id);
  const wager = parseAmount(args[1], balance);
  if (wager === null) return reply(`Usage: \`${prefix}bet ${name} <amount|all>\``);
  if (wager < MIN) return reply(balance < MIN ? `You need at least ${formatMoney(MIN)} to bet. You have ${formatMoney(balance)}.` : `The least you can bet is ${formatMoney(MIN)}.`);
  // The wager is held (and recorded) for the whole game, so it can't be
  // spent twice, and a restart mid-game hands it back.
  if (!db.holdBet(server.key, user.id, wager)) return reply(`You only have ${formatMoney(balance)}.`);

  let settled = false;
  const settle = (payout, result) => { db.settleBet(server.key, user.id, payout, result && { game: name, result, wager }); settled = true; };
  // An admin's ?cooldown override replaces the per-game cooldowns.
  const wait = (ms) => cooldowns.setRemaining(server.key, cmd, user.id, db.overrides(server.key).get(cmd.name) ?? ms);
  try {
    const mine = game.draw();
    // Only the game and its choices while it's on: odds live in ?bet.
    const edit = await replyEditable(`${game.ask} (waiting for your answer)\n${optionsLine(game.options)}`);
    const answer = await awaitAnswer((text) => matchAnswer(text, game.options, game.aliases) !== null, TIME);

    if (answer === null) {
      const penalty = Math.max(1, Math.round(wager * TIMEOUT_PENALTY));
      settle(wager - penalty, 'timeout');
      track.lost('betting', penalty);
      wait(TIMEOUT_COOLDOWN);
      return edit(`⌛ Timed out, bet cancelled. 5% penalty: ${red(`-${formatMoney(penalty)}`)}. You now have ${formatMoney(db.cents(server.key, user.id))}.`);
    }

    const [result, line] = game.judge(matchAnswer(answer, game.options, game.aliases), mine);
    const back = result === 'win' ? wager * game.pays : result === 'tie' ? wager : 0;
    settle(back, result);
    track.earned('betting', back - wager);
    track.lost('betting', wager - back);
    wait(game.cooldown[result]);
    const outcome = {
      win: `Congrats! ${green(`+${formatMoney(back - wager)}`)}.`,
      tie: `It's a tie, your ${formatMoney(wager)} is back.`,
      lose: `Sorry, you lost ${lost(wager)}.`,
    }[result];
    return edit(`${line} ${outcome} You now have ${formatMoney(db.cents(server.key, user.id))}.`);
  } catch (err) {
    // Something broke before the bet was settled: give the wager back.
    if (!settled) settle(wager);
    throw err;
  }
}

const pct = (n, of) => (!n || !of ? '0%' : n / of < 0.01 ? '<1%' : `${Math.round((n / of) * 100)}%`);
const signedPct = (x) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;
const signed = (cents) => (cents ? (cents < 0 ? red : green)(`${cents < 0 ? '-' : '+'}${formatMoney(Math.abs(cents))}`) : formatMoney(0));

async function showRecord({ args, user, server, db, findMember, reply, notHere }) {
  let who = user;
  if (args.length) {
    const found = await findTarget(findMember, args);
    if (!found.member) return reply(`I can't find anyone called **${found.query}** here.`);
    who = found.member;
  }
  if (!who) return notHere();

  const rows = db.betStats(server.key, who.id);
  const sum = (field) => rows.reduce((n, r) => n + r[field], 0);
  const bets = sum('bets');
  const whose = who === user ? 'You have' : `**${who.name}** has`;
  if (!bets) return reply(`${whose} never placed a bet. \`?bet\` shows the games.`);

  const [wins, losses, ties, timeouts] = ['wins', 'losses', 'ties', 'timeouts'].map(sum);
  const [wagered, won, lostTotal] = ['wagered', 'won', 'lost'].map(sum);
  const biggest = Math.max(...rows.map((r) => r.biggest_win));

  // Luck: real wins against what the odds expected, once there's enough to go on.
  const answered = bets - timeouts;
  const expected = rows.reduce((n, r) => n + (r.bets - r.timeouts) * (GAMES[r.game]?.chance ?? 0), 0);
  const luck = answered >= LUCK_AFTER && expected ? ` · Luck ${signedPct(wins / expected - 1)}` : '';

  const results = [['Won', wins], ['Lost', losses], ['Tied', ties], ['Timed out', timeouts]]
    .filter(([label, n]) => n || label === 'Won' || label === 'Lost')
    .map(([label, n]) => `${label} ${n} (${pct(n, bets)})`);
  const lines = [
    `**${who.name}'s betting record**`,
    `${bets} bet${bets === 1 ? '' : 's'} · ${formatMoney(wagered)} wagered`,
    results.join(' · '),
    `${gained(won)} won · ${lost(lostTotal)} lost · Net **${signed(won - lostTotal)}**`,
    `Biggest win ${gained(biggest)}${luck}`,
  ];
  return reply(lines.join('\n'));
}
