// Crew: deckhands, miners and hunting guides (?crew) who come along on
// every ?fish, ?mine and ?hunt and catch with their own gear, so they cost
// none of your energy, tool wear or ammo. What they catch goes in your
// Backpack; whatever doesn't fit is thrown back. Each job's outfit from the
// shop (a boat, a mine, hunting land) sets how many crew it has room for and
// adds perks.
// Every job has a danger: its hospital chance, split evenly between everyone
// on the trip. With BOSS or more crew able to work you stay back and run
// things, so only they can get hurt. A hurt crewmate is out for HURT, and
// workers' comp pays their bill.
// Crew are paid a flat wage for every trip they work (about 40% of an
// average catch), plus workers' comp on top by how dangerous the job is. It
// adds up until payday, 24 hours after the first trip since the last one,
// and is collected like a hospital bill on the next economy command.
import { randomInt } from 'node:crypto';
import { toolById, rankOf } from './tools.js';
import { rollTier, pick, foundLine } from './gather.js';
import { placeOf, contents } from './storage.js';
import { takeable } from './hospital.js';
import { formatMoney } from './items.js';
import { lost } from './colors.js';
import { formatWait } from './duration.js';

export const BOSS = 5;
const HURT = 3_600_000;
const DAY = 86_400_000;
// Crew trips' energy a payday covers before wages go up to OVERTIME.
const SHIFT = 120;
const OVERTIME = 1.5;

// `comp` is workers' comp, as a % of wages. `start` is where they work
// before any outfit.
export const JOBS = {
  fish: { label: 'Fishing', emoji: '🎣', noun: 'deckhand', kind: 'boat', comp: 10, start: 'the dock' },
  mine: { label: 'Mining', emoji: '⛏️', noun: 'miner', kind: 'mine_site', comp: 15, start: 'roadside rocks' },
  hunt: { label: 'Hunting', emoji: '🔫', noun: 'hunting guide', kind: 'land', comp: 25, start: 'public land' },
};
// A crewmate's wage for one trip, in cents, by what the trip was.
export const WAGES = { fish: 8_500, mine: 19_000, hunt_small: 21_000, hunt_big: 43_000 };
const PER = { fish: 'a cast', mine: 'a swing', hunt_small: 'a small game hunt', hunt_big: 'a big game hunt' };

export const jobOf = (from) => (from.startsWith('hunt') ? 'hunt' : from);
export const wageLine = (job) => Object.keys(WAGES).filter((from) => jobOf(from) === job)
  .map((from) => `${formatMoney(WAGES[from])} ${PER[from]}`).join(', ');

// The first hire in a job is $5,000 and each one after costs 50% more.
export const hirePrice = (hired) => Math.round(5_000 * 1.5 ** hired) * 100;

// Names offered when hiring.
export const NAMES = [
  'Dave', 'Mike', 'Steve', 'Tom', 'Bill', 'Jim', 'Bob', 'Joe', 'Frank', 'Gary', 'Larry', 'Ron', 'Doug', 'Ken',
  'Rick', 'Tony', 'Chris', 'Matt', 'Jake', 'Kyle', 'Ryan', 'Nick', 'Sam', 'Ben', 'Jack', 'Harry', 'George',
  'Charlie', 'Henry', 'Arthur', 'Ted', 'Pete', 'Phil', 'Greg', 'Carl', 'Wayne', 'Dean', 'Gavin', 'Stuart',
  'Nigel', 'Clive', 'Trevor', 'Barry', 'Keith', 'Colin', 'Graham', 'Hank', 'Earl', 'Walt', 'Roy',
];

// Someone's outfit for a job, its tier (0 for none, then 1-4) and how many
// crew it has room for.
export function outfitOf(db, server, userId, job) {
  const outfit = toolById.get(db.tool(server, userId, JOBS[job].kind)?.item) ?? null;
  return { outfit, tier: outfit ? rankOf(outfit) + 1 : 0, room: outfit?.crew ?? 2 };
}

// A job's odds with its outfit's perks, in tenths so a 10% boost stays a
// whole number. Boosts come out of common.
function perked(tiers, job, tier) {
  let odds = tiers.map((t) => ({ ...t, weight: t.weight * 10 }));
  const shift = (from, to, amount) => {
    odds = odds.map((t) => (t.tier === from ? { ...t, weight: t.weight - amount } : t.tier === to ? { ...t, weight: t.weight + amount } : t));
  };
  const boost = (tier) => {
    const t = odds.find((o) => o.tier === tier);
    if (t) shift('common', tier, Math.round(t.weight * 0.1));
  };
  if (job === 'fish' && tier >= 2) shift('nothing', 'common', odds.find((t) => t.tier === 'nothing')?.weight ?? 0);
  if (tier >= 3) ['rare', 'epic'].forEach(boost);
  if (tier >= 4) boost('legendary');
  return odds;
}

// Your odds with `ready` crew along: the hospital stays as it is while
// everything else is multiplied by everyone on the trip, so your chance is
// an even share (what comes off goes to common, the way a better gun's
// does). The boss can't get hurt.
function yourOdds(odds, ready) {
  const hospital = odds.find((t) => t.tier === 'hospital')?.weight ?? 0;
  if (!hospital || !ready) return odds;
  const people = ready + 1;
  const boss = ready >= BOSS;
  return odds.map((t) => {
    if (t.tier === 'hospital') return { ...t, weight: boss ? 0 : hospital };
    if (t.tier === 'common') return { ...t, weight: boss ? t.weight + hospital : t.weight * people + hospital * (people - 1) };
    return { ...t, weight: boss ? t.weight : t.weight * people };
  }).filter((t) => t.weight > 0);
}

// Everything a trip needs to know about someone's crew in the job `from`
// belongs to: who's able to work, the outfit tier, and the odds for the
// crew (`odds`, perks included) and for you (`yours`).
export function partyFor(db, server, userId, from, tiers, now = Date.now()) {
  const job = jobOf(from);
  const { tier } = outfitOf(db, server, userId, job);
  const ready = db.crew(server, userId).filter((c) => c.job === job && c.hurt_until <= now);
  const odds = perked(tiers, job, tier);
  return { from, job, tier, ready, odds, yours: yourOdds(odds, ready.length) };
}

// The crew's side of a trip, after yours: one of them may get hurt, the
// rest each roll a catch (no hospital: that was the danger roll), and
// everyone who went is owed a wage. Returns the reply's lines.
export function crewTrip(db, server, userId, party, { energy, stream, emoji, verb, track }, now = Date.now()) {
  const { from, job, tier, ready, odds } = party;
  if (!ready.length) return [];
  const total = odds.reduce((sum, t) => sum + t.weight, 0);
  const hospital = odds.find((t) => t.tier === 'hospital')?.weight ?? 0;
  const boss = ready.length >= BOSS;
  const hurt = hospital && (boss ? randomInt(total) < hospital : randomInt(total * (ready.length + 1)) < hospital * ready.length) ? pick(ready) : null;
  const heal = job === 'hunt' && tier >= 2 ? HURT / 2 : HURT;

  const crewOdds = odds.filter((t) => t.tier !== 'hospital').map((t) => (t.tier === 'common' ? { ...t, weight: t.weight + hospital } : t));
  const { used, space } = placeOf(db, server, userId, 'backpack');
  let room = space - used;
  const kept = [];
  let tossed = 0;
  for (const mate of ready) {
    if (mate === hurt) continue;
    const item = rollTier(crewOdds, from);
    if (!item?.id) continue;
    if (room-- > 0) kept.push({ mate, item });
    else tossed++;
  }
  for (const { item } of kept) {
    db.addItem(server, userId, item.id);
    track.earned(stream, item.price);
  }

  const before = db.payroll(server, userId)?.energy ?? 0;
  const wage = Math.round(WAGES[from] * (before >= SHIFT ? OVERTIME : 1));
  db.crewWorked(server, userId, ready.map((c) => c.id), wage, energy, now, hurt && { id: hurt.id, until: now + heal });

  // Epics and legendaries get their own line; everything else is summed up.
  const big = kept.filter(({ item }) => item.tier === 'epic' || item.tier === 'legendary');
  const rest = new Map();
  for (const { item } of kept) if (!big.some((b) => b.item === item)) rest.set(item.id, (rest.get(item.id) ?? 0) + 1);
  const lines = big.map(({ mate, item }) => foundLine(emoji, mate.name, verb, item));
  const crew = boss ? '👷 Your crew (you ran it as the boss)' : '👷 Your crew';
  if (rest.size) lines.push(`${crew} ${big.length ? 'also ' : ''}${verb} ${contents([...rest].map(([item, qty]) => ({ item, qty })))}.`);
  else if (!big.length) lines.push(`${crew} came back empty-handed.`);
  if (tossed) lines.push(`🎒 Your Backpack is full, so your crew threw back ${tossed} ${tossed === 1 ? 'catch' : 'catches'}.`);
  if (hurt) lines.push(`🩹 **${hurt.name}** got hurt and is out for ${formatWait(heal)}. Workers' comp has it covered.`);
  if (before < SHIFT && before + energy >= SHIFT) lines.push('⏱️ That was a full shift: crew wages are 1.5× from now until payday.');
  return lines;
}

// "Dave, Mike and Steve", or "Dave, Mike, Steve, Tom, Bill and 3 more".
export function names(list, most = 5) {
  const shown = list.slice(0, list.length > most ? most : list.length);
  const more = list.length - shown.length;
  if (more) return `${shown.join(', ')} and ${more} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}` : shown[0] ?? '';
}

// What someone owes their crew right now ({ wages, comp }).
export function owed(crew) {
  const wages = crew.reduce((sum, c) => sum + c.owed, 0);
  const comp = crew.reduce((sum, c) => sum + Math.round((c.owed * JOBS[c.job].comp) / 100), 0);
  return { wages, comp };
}

// When payday is ({ at, wages, comp }), or null with nothing running.
export function nextPayday(db, server, userId) {
  const pay = db.payroll(server, userId);
  return pay && { at: pay.since + DAY, ...owed(db.crew(server, userId)) };
}

// Payday, if it's due: wages and workers' comp, collected like a hospital
// bill (cash, then Backpack, then safe). Whoever's pay it couldn't cover
// quits, newest hire first. Returns the line to post, or null.
export function payday(db, server, userId, now = Date.now()) {
  const pay = db.payroll(server, userId);
  if (!pay || now - pay.since < DAY) return null;
  const crew = db.crew(server, userId);
  const { wages, comp } = owed(crew);
  if (!wages) {
    db.settlePayroll(server, userId, []);
    return null;
  }
  const paid = db.payBill(server, userId, wages + comp, takeable);
  db.lose(server, userId, 'crew', wages + comp - paid.forgiven);
  const quit = [];
  let short = paid.forgiven;
  for (const c of [...crew].reverse()) {
    if (short <= 0) break;
    if (!c.owed) continue;
    quit.push(c);
    short -= c.owed + Math.round((c.owed * JOBS[c.job].comp) / 100);
  }
  db.settlePayroll(server, userId, quit.map((c) => c.id));

  const worked = crew.filter((c) => c.trips);
  const trips = worked.reduce((sum, c) => sum + c.trips, 0);
  const how = paid.taken.length || paid.forgiven ? ` ${payLine(paid)}` : '';
  const left = quit.length ? `\n😠 You couldn't cover it all, so ${names(quit.map((c) => c.name), Infinity)} quit.` : '';
  return `💰 **Payday!** ${names(worked.map((c) => c.name))} worked ${trips} ${trips === 1 ? 'trip' : 'trips'}: ${lost(wages)} in wages + ${lost(comp)} workers' comp.${how}${left}`;
}

// How a payday or final paycheck was covered, when it took more than cash.
function payLine({ cash, taken, change, forgiven }) {
  const items = taken.reduce((n, t) => n + t.qty, 0);
  const parts = [];
  if (cash) parts.push(`${lost(cash)} in cash`);
  if (items) parts.push(`${items} ${items === 1 ? 'item' : 'items'} from your stuff${change ? ` (${formatMoney(change)} back in change)` : ''}`);
  const covered = parts.length ? `It took ${parts.join(' and ')}.` : '';
  return `${covered}${forgiven ? `${covered ? ' ' : ''}${lost(forgiven)} went unpaid.` : ''}`;
}

// A crewmate's final paycheck when they're let go: what they're owed
// (workers' comp included), collected the same way. Returns the line.
export function finalPaycheck(db, server, userId, mate) {
  const comp = Math.round((mate.owed * JOBS[mate.job].comp) / 100);
  db.fire(mate.id);
  if (!mate.owed) return '';
  const paid = db.payBill(server, userId, mate.owed + comp, takeable);
  db.lose(server, userId, 'crew', mate.owed + comp - paid.forgiven);
  const how = paid.taken.length || paid.forgiven ? ` ${payLine(paid)}` : '';
  return ` Their final paycheck: ${lost(mate.owed + comp)}.${how}`;
}

// A name someone typed for a crewmate: plain letters, digits, spaces,
// apostrophes, dots and dashes, up to 20 characters. Null if nothing's left.
export function crewName(text) {
  const name = text.normalize('NFKD').replace(/[^A-Za-z0-9 '.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20).trim();
  return /[A-Za-z]/.test(name) ? name : null;
}
