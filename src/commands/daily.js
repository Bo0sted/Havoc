import { formatMoney } from '../items.js';
import { formatWait } from '../duration.js';
import { gained } from '../colors.js';

const DAY = 86_400_000;
const BASE = 10_000; // $100 on day one...
const BONUS = 2_500; // ...plus $25 for each day of the streak after that,
const MAX_STREAK_BONUS = 7; // up to day 7 ($250)
const pays = (streak) => BASE + BONUS * (Math.min(streak, MAX_STREAK_BONUS) - 1);

// Claim times live in the database (not the in-memory cooldowns), so a
// restart doesn't hand out a second daily, and admins wait like everyone else.
export default {
  name: 'daily',
  category: 'economy',
  description: 'free cash every 24 hours; claim again within 48 hours to build a streak',
  economy: true,
  earns: true, // counts toward milestones
  async run({ user, server, db, reply, notHere }) {
    if (!user) return notHere();
    const now = Date.now();
    const prev = db.daily(server.key, user.id);
    if (prev && now - prev.last < DAY) {
      return reply(`⏳ You already claimed today. Your next daily is ready in ${formatWait(DAY - (now - prev.last))} and will be **${formatMoney(pays(prev.streak + 1))}**.`);
    }

    const streak = prev && now - prev.last < 2 * DAY ? prev.streak + 1 : 1;
    const cents = pays(streak);
    db.claimDaily(server.key, user.id, now, streak, cents);
    const fire = streak > 1 ? ` 🔥 ${streak}-day streak!` : prev?.streak > 1 ? ` Your ${prev.streak}-day streak ended.` : '';
    return reply(`💵 **${user.name}** claimed ${gained(cents)}!${fire} You now have ${formatMoney(db.cents(server.key, user.id))}.\nYour next daily will be **${formatMoney(pays(streak + 1))}** (come back in 24h, before 48h to keep your streak).`);
  },
};
