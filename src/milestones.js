// Rewards for running money-making commands (`earns`: fish, mine, hunt,
// daily, lottery, hangman, bet; not shop, sell, money and the like). Each
// milestone pays more than the last, from $250 at 10 commands to $350,000
// at 100,000, then $350,000 for every 50,000 after that. Only the first DAILY_CAP a day (UTC) count, so
// spamming cheap commands can't out-earn playing. Paid with the command
// that reaches it; the congratulations is a separate, non-silent ping.
import { formatMoney } from './items.js';

const MILESTONES = [
  [10, 25_000], [50, 50_000], [100, 100_000], [250, 250_000], [500, 500_000],
  [1_000, 1_000_000], [2_500, 2_000_000], [5_000, 3_500_000], [10_000, 6_000_000],
  [25_000, 12_500_000], [50_000, 20_000_000], [100_000, 35_000_000],
];
const [LAST, LAST_REWARD] = MILESTONES.at(-1);
const EVERY = 50_000;
export const DAILY_CAP = 500;
const DAY = 86_400_000;

// What reaching `count` pays in cents (0 if it isn't a milestone).
export function rewardAt(count) {
  if (count > LAST) return (count - LAST) % EVERY === 0 ? LAST_REWARD : 0;
  return MILESTONES.find(([at]) => at === count)?.[1] ?? 0;
}

// The milestone after `count`.
export function nextAfter(count) {
  return MILESTONES.find(([at]) => at > count)?.[0] ?? LAST + (Math.floor((count - LAST) / EVERY) + 1) * EVERY;
}

// Counts one money-making command. When it reached a milestone (already paid),
// returns the congratulations as a function of how to @mention them; else null.
export function countCommand(db, server, userId, now = Date.now()) {
  const counted = db.countCommand(server, userId, Math.floor(now / DAY), DAILY_CAP, rewardAt);
  if (!counted?.reward) return null;
  const { total, reward } = counted;
  const next = nextAfter(total);
  const more = rewardAt(next) > reward ? 'an increased reward' : 'another reward';
  return (mention) => `Congrats ${mention}, you reached a milestone of ${total.toLocaleString('en-US')} economy commands. `
    + `${formatMoney(reward)} has been automatically deposited into your bank account. `
    + `Your next milestone is ${next.toLocaleString('en-US')} commands, with ${more}.`;
}
