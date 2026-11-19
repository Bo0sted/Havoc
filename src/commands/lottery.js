import { randomInt } from 'node:crypto';
import { formatMoney } from '../items.js';
import { claimGame } from '../games.js';
import { matchAnswer, optionsLine } from '../answers.js';

// Simple, friendly nouns; each round shows CHOICES of them. The odds only
// depend on CHOICES (1 in 4), never on how long this list is.
const WORDS = [
  'apple', 'banana', 'bread', 'cheese', 'cookie', 'pizza', 'carrot', 'lemon',
  'cat', 'dog', 'horse', 'rabbit', 'duck', 'frog', 'tiger', 'whale',
  'chair', 'table', 'lamp', 'clock', 'pillow', 'mirror', 'window', 'door',
  'boat', 'train', 'bike', 'plane', 'rocket', 'truck',
  'tree', 'flower', 'cloud', 'river', 'mountain', 'island', 'star', 'moon',
  'guitar', 'drum', 'piano', 'ball', 'kite', 'robot', 'crown', 'key',
  'hat', 'shoe', 'book', 'candle',
];
const CHOICES = 4;
const TIME = 10_000;
const WIN_COOLDOWN = 10_000; // a loss or timeout keeps the full cooldown below
const BASE = 10_000; // $100, doubled for every win in a row before this one

// crypto.randomInt draws from the OS's secure random source with no modulo
// bias, so every word (and every winner) is exactly as likely as the next.
function draw() {
  const pool = [...WORDS];
  for (let i = 0; i < CHOICES; i++) {
    const j = i + randomInt(pool.length - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const shown = pool.slice(0, CHOICES);
  return { shown, answer: shown[randomInt(CHOICES)] };
}

const pays = (streak) => BASE * 2 ** streak; // what the next win pays

export default {
  name: 'lottery',
  category: 'economy',
  description: 'pick the winning word out of 4 within 10 seconds; $100 a win, doubling for every win in a row',
  cooldown: 30 * 60_000,
  cooldownText: (wait) => `🎟️ Your next ticket is ready in ${wait}.`,
  economy: true,
  earns: true, // counts toward milestones
  async run({ cmd, user, server, db, cooldowns, awaitAnswer, replyEditable, notHere }) {
    if (!user) return notHere();
    const release = claimGame(server.key, user.id);
    if (!release) return;
    try {
      const { shown, answer } = draw();
      const edit = await replyEditable(`Pick the winning word! (waiting for your answer)\n${optionsLine(shown)}`);
      const said = await awaitAnswer((text) => matchAnswer(text, shown) !== null, TIME);
      const guess = said && matchAnswer(said, shown);

      const streak = db.lotteryStreak(server.key, user.id);
      if (guess === answer) {
        const cents = pays(streak);
        db.lotteryWin(server.key, user.id, streak + 1, cents);
        cooldowns.setRemaining(server.key, cmd, user.id, WIN_COOLDOWN);
        const row = streak ? ` That's ${streak + 1} in a row!` : '';
        return edit(`🎉 Congrats **${user.name}**, the word was **${answer}**! +${formatMoney(cents)}.${row} Your next win pays **${formatMoney(pays(streak + 1))}**.`);
      }

      db.lotteryLoss(server.key, user.id);
      const lost = streak > 1 ? ` Your ${streak}-win streak is over.` : '';
      return edit(guess
        ? `🎟️ Sorry **${user.name}**, the word was **${answer}** (you picked **${guess}**).${lost}`
        : `⌛ Timed out, the word was **${answer}**.${lost}`);
    } finally {
      release();
    }
  },
};
