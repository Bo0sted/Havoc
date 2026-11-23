import { parseWhen, whenProblem, SNOOZE_DEFAULT, SNOOZE_WINDOW } from '../reminders.js';

const sec = (ms) => Math.floor(ms / 1000);

// Pushes back the person's latest reminder that went off (in the last day,
// and not snoozed since), by a time from now or to a timestamp.
export default {
  name: 'snooze',
  category: 'utility',
  usage: '[time]',
  description: 'push your latest reminder back (1 hour by default, or 30min, 2hr, 1d, a timestamp)',
  cooldown: 3_000,
  dm: true,
  async run({ prefix, args, server, db, user, reminders, reply, notHere }) {
    if (!user) return notHere();
    const when = args.length ? parseWhen(args) : { at: Date.now() + SNOOZE_DEFAULT, used: 0 };
    if (!when || when.used < args.length) return reply(`That's not a time I understand. Try \`${prefix}snooze 30min\`, \`${prefix}snooze 2hr\` or \`${prefix}snooze 1d\`.`);
    const problem = whenProblem(when.at);
    if (problem) return reply(problem);
    const r = db.latestSentReminder(server.key, user.id, Date.now() - SNOOZE_WINDOW);
    if (!r || !(await reminders.snooze(server, r, when.at))) {
      return reply('You have no reminder to snooze. Only ones that went off in the last 24 hours can be.');
    }
    return reply(`💤 Snoozed until <t:${sec(when.at)}:f> (<t:${sec(when.at)}:R>).`);
  },
};
