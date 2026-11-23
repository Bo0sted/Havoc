// Reminders (?remind, ?snooze). They're kept in the db and go off where they
// were set (a channel, thread, topic, DM or group DM), from one timer for
// every server; anything that came due while Havoc was offline (or a server
// was unreachable) goes off as soon as that server's channel list is back.
// A reminder pings its owner (not in a 1:1 DM, where the message itself
// notifies), and for a day after it goes off it can be snoozed by its owner
// reacting 1️⃣ 2️⃣ 3️⃣ to it, or with ?snooze.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export const MAX_AHEAD = 30 * DAY;
export const MAX_TEXT = 1000;
export const MAX_REMINDERS = 100;
// How long after going off a reminder can still be snoozed.
export const SNOOZE_WINDOW = DAY;
export const SNOOZE_DEFAULT = HOUR;
// The reactions Havoc puts on a reminder, and how long each snoozes it.
const REACTIONS = [['1️⃣', HOUR, '1 hour'], ['2️⃣', 12 * HOUR, '12 hours'], ['3️⃣', DAY, '1 day']];

const UNITS = {
  m: MINUTE, min: MINUTE, mins: MINUTE, minute: MINUTE, minutes: MINUTE,
  h: HOUR, hr: HOUR, hrs: HOUR, hour: HOUR, hours: HOUR,
  d: DAY, day: DAY, days: DAY,
  w: WEEK, wk: WEEK, week: WEEK, weeks: WEEK,
};

const sec = (ms) => Math.floor(ms / 1000);

// The time at the start of `words`: a Haven timestamp (<t:1795454881:F>, any
// style), the plain number in one, or a time from now (2min, 2hr, 2d, 1w, or
// "2 hr"). Returns { at, used } (how many words it took), or null.
export function parseWhen(words, now = Date.now()) {
  const [first = '', second = ''] = words;
  const stamp = /^<t:(\d+)(?::[a-z])?>$/i.exec(first) ?? /^(\d{9,})$/.exec(first);
  if (stamp) return { at: Number(stamp[1]) * 1000, used: 1 };
  const joined = /^(\d+)([a-z]+)$/i.exec(first);
  const unit = joined ? UNITS[joined[2].toLowerCase()] : undefined;
  if (unit) return { at: now + Number(joined[1]) * unit, used: 1 };
  if (/^\d+$/.test(first) && UNITS[second.toLowerCase()]) return { at: now + Number(first) * UNITS[second.toLowerCase()], used: 2 };
  return null;
}

// Why a reminder can't be set for `at`, or null when it can.
export function whenProblem(at, now = Date.now()) {
  if (at <= now) return 'That time has already passed.';
  if (at > now + MAX_AHEAD) return "That's too far away. Reminders can be at most 30 days ahead.";
  return null;
}

// A reminder's text on one short line, for lists.
export function preview(text, max = 60) {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

// A reminder's message: the owner's mention (none in a 1:1 DM), its text and
// fields, then how to snooze it, or once it's snoozed, until when.
export function reminderText(r, mention, prefix, { late = false, snoozedUntil = null } = {}) {
  const lines = ['# ⏰ Reminder', mention ? `${mention} ${r.text}` : r.text, '', `\`Scheduled on:\` <t:${sec(r.created)}:R>`];
  if (r.snoozes) lines.push(`\`Snoozed:\` ${r.snoozes} ${r.snoozes === 1 ? 'time' : 'times'}`);
  if (late) lines.push(`\`Was due:\` <t:${sec(r.due)}:R>`);
  if (snoozedUntil) {
    lines.push(`\`Snoozed until:\` <t:${sec(snoozedUntil)}:f>`);
  } else {
    lines.push(`Snooze by reacting to this message or using \`${prefix}snooze <time>\``);
    lines.push(REACTIONS.map(([emoji, , label]) => `${emoji} ${label}`).join(' · '));
  }
  return lines.join('\n');
}

export function createReminders({ db, servers, prefix }) {
  let timer = null;
  let retry = null;
  // Reminders being sent right now, so a second run never sends one twice.
  const sending = new Set();
  // A reminder that didn't go out is tried again in a minute.
  const retryLater = () => { retry ??= setTimeout(() => { retry = null; run(); }, MINUTE); };

  // Sends every due reminder whose server is connected, then sleeps until
  // the next one (an hour at most, so a long wait never overflows the timer).
  function run() {
    clearTimeout(timer);
    const now = Date.now();
    for (const r of db.dueReminders(now)) {
      const server = servers.find((s) => s.key === r.server);
      if (!server?.client?.channelsLoaded || sending.has(r.id)) continue;
      sending.add(r.id);
      deliver(server, r)
        .catch((err) => {
          console.error(`[${server.name}] Reminder ${r.id} didn't go out, trying again in a minute:`, err);
          retryLater();
        })
        .finally(() => sending.delete(r.id));
    }
    const next = db.nextReminder(now);
    if (next !== null) timer = setTimeout(run, Math.min(next - now, HOUR));
  }

  // Where a reminder goes off ({ code, threadId, dm }), or null when Havoc
  // can't reach that channel or DM any more.
  function placeOf(client, r) {
    if (r.place === 'channel') {
      const channel = client.channelById(r.channel_id);
      return channel && { code: channel.code, threadId: r.thread_id, dm: null };
    }
    const dm = client.dmById(r.channel_id);
    return dm && { code: dm.code, threadId: r.thread_id, dm };
  }

  // The owner's @mention there, or null in a 1:1 DM (or if they can't be found).
  async function mentionFor(client, r, { code, dm }) {
    if (dm && !dm.group) return null;
    const name = (await client.loginName(r.user_id, code)) ?? client.members.get(r.user_id)?.name;
    return name ? `@${name}` : null;
  }

  async function deliver(server, r) {
    const { client } = server;
    let place = placeOf(client, r);
    if (!place) {
      // The channel is gone, or Havoc can't see it any more: their DMs instead.
      const code = await client.openDm(r.user_id);
      place = code && { code, threadId: null, dm: client.dmChannels.get(code) };
    }
    if (!place) {
      console.warn(`[${server.name}] Dropped reminder ${r.id}: its channel is gone and its owner couldn't be DMed.`);
      return db.deleteReminder(r.id);
    }
    const text = reminderText(r, await mentionFor(client, r, place), prefix, { late: Date.now() - r.due > MINUTE });
    const id = await client.sendForEdit(place.code, text, { threadId: place.threadId, silent: false });
    if (!id) {
      // Not sent (a DM that couldn't be encrypted), or Haven never showed it
      // (it refused it: too many messages at once, counting ones sent just
      // before a restart): it waits and is tried again, for up to a day.
      if (Date.now() - r.due < DAY) throw new Error(id === false ? "its DM couldn't be encrypted" : "Haven didn't post it");
      console.warn(`[${server.name}] Dropped reminder ${r.id}: it couldn't be sent for a day.`);
      return db.deleteReminder(r.id);
    }
    db.reminderSent(r.id, Date.now(), place.code, id);
    for (const [emoji] of REACTIONS) client.react(id, emoji);
  }

  // Puts a reminder that went off back to waiting until `until`, and edits
  // its message to say so (an edit, so nobody is pinged again). False if it
  // was already snoozed.
  async function snooze(server, r, until) {
    if (!db.snoozeReminder(r.id, until)) return false;
    run();
    if (r.sent_id) {
      const { client } = server;
      const mention = await mentionFor(client, r, { code: r.sent_code, dm: client.dmChannels.get(r.sent_code) });
      client.edit(r.sent_code, r.sent_id, reminderText(r, mention, prefix, { late: r.sent_at - r.due > MINUTE, snoozedUntil: until }));
    }
    return true;
  }

  // A change to a message's reactions: on a reminder that went off, its
  // owner's 1️⃣ 2️⃣ 3️⃣ snoozes it (only the first counts).
  async function reacted(server, { messageId, reactions }) {
    const r = db.reminderBySent(server.key, messageId);
    if (!r) return;
    const pick = REACTIONS.find(([emoji]) => reactions?.some((x) => x.user_id === r.user_id && x.emoji === emoji));
    if (pick) await snooze(server, r, Date.now() + pick[1]);
  }

  return { run, snooze, reacted };
}
