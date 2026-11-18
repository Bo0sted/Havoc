import { randomInt } from 'node:crypto';
import { formatMoney } from '../items.js';
import { claimGame } from '../games.js';
import { WORDS } from '../words.js';

const SECONDS_PER_LETTER = 7; // one shared timer: 7s × the word's length
const PER_LETTER = 10_000; // $100 per letter, and $100 off for each try used
const PENALTY = 0.1; // quitting or timing out costs 10% of the starting payout
const WARN_AT = 15_000; // the message is refreshed with a warning at 15s left
const WIN_COOLDOWN = 10_000;
const LOSS_COOLDOWN = 30_000;

export default {
  name: 'hangman',
  category: 'economy',
  description: 'guess a 5-8 letter word, one try per letter; pays $100 per letter, $100 less for each try used (`?quit` gives up)',
  cooldown: LOSS_COOLDOWN,
  economy: true,
  async run({ cmd, prefix, user, server, db, cooldowns, awaitAnswer, replyEditable, reply, notHere }) {
    if (!user) return notHere();
    const release = claimGame(server.key, user.id);
    if (!release) return;
    let done = false;
    let warnTimer;
    try {
      const word = WORDS[randomInt(WORDS.length)];
      const len = word.length;
      const shown = Array(len).fill(false);
      shown[randomInt(len)] = true;
      const tried = new Set();
      const end = Date.now() + SECONDS_PER_LETTER * 1000 * len;
      const endSecs = Math.floor(end / 1000);
      let used = 0;
      let warned = false;

      const payout = () => (len - used) * PER_LETTER;
      const render = () => [
        `Guess the word: \`${[...word].map((c, i) => (shown[i] ? c : '_')).join(' ')}\``,
        `${warned ? '⚠️ ' : ''}${len} letters · ${len - used} ${len - used === 1 ? 'try' : 'tries'} left · Payout: ${formatMoney(payout())} · Time's up <t:${endSecs}:R> (<t:${endSecs}:T>)`,
      ].join('\n');

      const edit = await replyEditable(render());
      const left = end - Date.now();
      if (left > WARN_AT) warnTimer = setTimeout(() => { if (!done) { warned = true; edit(render()); } }, left - WARN_AT);

      // An admin's ?cooldown override replaces these.
      const wait = (ms) => cooldowns.setRemaining(server.key, cmd, user.id, db.overrides(server.key).get(cmd.name) ?? ms);
      const finish = (text, ms) => { done = true; wait(ms); return edit(text); };
      const penalise = () => {
        const taken = db.takeUpTo(server.key, user.id, Math.round(len * PER_LETTER * PENALTY));
        return `${taken ? ` -${formatMoney(taken)} penalty.` : ''} You now have ${formatMoney(db.cents(server.key, user.id))}.`;
      };

      // A guess is one word (or one letter), edge punctuation ignored; anything with spaces is ordinary chat.
      const quit = `${prefix}quit`;
      const asWord = (text) => text.trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
      const accepts = (text) => text.trim().toLowerCase() === quit || /^[a-z]+$/.test(asWord(text));

      while (used < len) {
        const said = await awaitAnswer(accepts, end - Date.now());
        if (said === null) return finish(`⌛ Time's up! The word was **${word}**.${penalise()}`, LOSS_COOLDOWN);
        if (said.trim().toLowerCase() === quit) {
          const taken = db.takeUpTo(server.key, user.id, Math.round(len * PER_LETTER * PENALTY));
          const now = formatMoney(db.cents(server.key, user.id));
          return finish(taken
            ? `You quit. The word was **${word}**. I'm keeping ${formatMoney(taken)} for wasting my time. You now have ${now}.`
            : `You quit. The word was **${word}**. I'd charge you for wasting my time, but you're broke.`, LOSS_COOLDOWN);
        }

        const guess = asWord(said);
        // A letter reveals one hidden spot it's in, starting from the right, so
        // a doubled letter (the p's in apple) takes one guess per spot. It only
        // counts as a repeat once none of it is left hidden.
        const at = guess.length === 1 ? [...word].findLastIndex((c, i) => c === guess && !shown[i]) : -1;
        if (at >= 0) {
          tried.add(guess);
          shown[at] = true;
        } else if (tried.has(guess)) {
          await reply(`You already tried ${guess}, do you have memory issues?`);
        } else if (guess.length === 1) {
          tried.add(guess);
        } else if (guess.length !== len) {
          tried.add(guess);
          await reply(`The word is ${len} characters, you typed ${guess.length}, did you forget how to count?`);
        } else {
          tried.add(guess);
          // Letters in the right spot are revealed.
          [...guess].forEach((c, i) => { if (c === word[i]) shown[i] = true; });
        }

        if (shown.every(Boolean)) {
          const won = payout();
          db.addCents(server.key, user.id, won);
          return finish(`🎉 Correct! The word was **${word}**. +${formatMoney(won)}. You now have ${formatMoney(db.cents(server.key, user.id))}.`, WIN_COOLDOWN);
        }
        used += 1;
        if (used < len) await edit(render());
      }
      return finish(`Out of tries! The word was **${word}**.`, LOSS_COOLDOWN);
    } finally {
      done = true;
      clearTimeout(warnTimer);
      release();
    }
  },
};
