import { toolById, ammoById } from '../tools.js';
import { energyOf, spend, waitFor } from '../energy.js';
import { formatWait } from '../duration.js';
import { matchAnswer } from '../answers.js';
import { pick, backpackFull, foundLine, charmedCatch, charmedCost } from '../gather.js';
import { drawCharm, kickedIn } from '../charms.js';
import { hospitalize, billLine } from '../hospital.js';
import { placeOf } from '../storage.js';
import { partyFor, crewTrip } from '../crew.js';
import { formatMoney } from '../items.js';
import { gained, lost } from '../colors.js';

// ?hunt settings: auto/off choices saved on the hunter's profile, all off
// by default. `auto` / `off` say what each means for hunting.
const SETTINGS = {
  ammo: {
    description: 'Would you like to automatically purchase more ammo when you run out? The bot will ensure you have enough before making the purchase',
    auto: () => 'when you run out of ammo, the bot buys another box for your gun if you can afford it',
    off: (p) => `when you run out of ammo, you buy more yourself in \`${p}shop\``,
  },
};

// The riskiest jobs, and the best paid: a Hunting License, a gun and 1
// round per hunt (hunting guides bring their own). Small game (any gun, 2
// energy) is ~$521 a hunt, a bit more per energy than mining, with a 2%
// risk of the hospital; big game (a shotgun or better, 3 energy) is ~$1,068
// a hunt, more again, and riskier still. Misses are rare (5%, any gun). The
// gun only changes big game's hospital chance (what it saves goes to common
// game), so a better gun is safer, not richer. Bills grow with what you're
// worth (hospital.js), so past ~$100k hunting alone stops paying well:
// guides share the risk (crew.js).
const MODES = {
  small: {
    energy: 2,
    game: 'small game',
    from: 'hunt_small',
    tiers: () => [
      { tier: 'hospital', weight: 2 },
      { tier: 'nothing', weight: 5 },
      { tier: 'common', weight: 46 },
      { tier: 'rare', weight: 32 },
      { tier: 'epic', weight: 15 },
    ],
    misses: [
      'You missed. The squirrel laughed at you.',
      'Everything heard you coming and left.',
      'You sat in the woods for hours and saw nothing.',
    ],
    hurt: [
      'You fell out of your tree stand.',
      'A tick got you. Lyme disease, of all things.',
      'You tripped over a log and sprained your ankle.',
      'A goose attacked you. It was not a fair fight.',
    ],
  },
  big: {
    energy: 3,
    game: 'big game',
    from: 'hunt_big',
    tiers: (gun) => [
      { tier: 'hospital', weight: gun.hospital },
      { tier: 'nothing', weight: 5 },
      { tier: 'common', weight: 61 - gun.hospital },
      { tier: 'rare', weight: 20 },
      { tier: 'epic', weight: 8 },
      { tier: 'legendary', weight: 6 },
    ],
    misses: [
      'You missed. The deer looked disappointed.',
      'The elk spotted you first. Gone.',
      'You got buck fever and forgot to pull the trigger.',
    ],
    hurt: [
      'A black bear charged you.',
      'A bull moose stomped you flat.',
      'A wild hog ran you over.',
      'You startled a grizzly. The grizzly won.',
    ],
  },
};

const NO_GUN = [
  'You tried hunting with a slingshot. A squirrel took it from you.',
  'You chased a rabbit with your bare hands. The rabbit won.',
  'You threw a rock at a deer. The deer was unimpressed.',
];

export default {
  name: 'hunt',
  category: 'economy',
  usage: ['small', 'big', 'settings'],
  description: 'go hunting (needs a Hunting License, a gun and ammo from the shop): small game takes any gun and 2 energy, big game a shotgun or better and 3 energy, with the biggest risk of the hospital; `settings` can buy ammo for you when you run out',
  // Per mode, for ?energy.
  energies: { small: MODES.small.energy, big: MODES.big.energy },
  cooldown: 5_000,
  economy: true,
  cooldownText: (wait) => `🔫 You're still reloading. Try again in ${wait}.`,
  async run({ prefix, args, user, server, db, track, reply, notHere }) {
    if (['settings', 'setting'].includes(args[0]?.toLowerCase())) {
      return user ? reply(settings(prefix, args.slice(1), db, server, user)) : notHere();
    }
    const mode = MODES[matchAnswer(args.join(' '), Object.keys(MODES))];
    if (!mode) return reply(`Usage: \`${prefix}hunt small\` (any gun, 2 energy) or \`${prefix}hunt big\` (a shotgun or better, 3 energy)`);
    if (!user) return notHere();

    const licenses = db.licenses(server.key, user.id);
    if (!licenses.includes('hunting_license')) return reply(`🚔 A game warden stopped you. You need a Hunting License: check \`${prefix}shop\`.`);
    const gun = toolById.get(db.tool(server.key, user.id, 'gun')?.item);
    if (!gun) {
      const license = licenses.includes('gun_license') ? '' : ' (and a Gun License to buy one)';
      return reply(`🔫 ${pick(NO_GUN)}\nYou need a gun${license}. Check \`${prefix}shop\`.`);
    }
    if (mode === MODES.big && !gun.big) return reply(`🔫 Your ${gun.name} is too small for big game. That takes a shotgun or better: check \`${prefix}shop\`.`);
    const ammo = ammoById.get(gun.ammo);
    if (!db.ammo(server.key, user.id).get(ammo.id)) return outOfAmmo(gun, ammo, { prefix, user, server, db, track, reply });
    const full = backpackFull(prefix, db, server.key, user.id);
    if (full) return reply(full);

    const bar = energyOf(db, server.key, user.id);
    if (bar.points < mode.energy) {
      return reply(`😮‍💨 You're exhausted. Hunting ${mode.game} takes ${mode.energy} energy and you have ${bar.points}. Enough in ${formatWait(waitFor(bar, mode.energy))}, or recover faster in \`${prefix}shop\`.`);
    }
    // One charm may fire; it's only used up once the hunt really happens.
    const { used, space } = placeOf(db, server.key, user.id, 'backpack');
    const drawn = drawCharm(db, server.key, user.id, { use: mode.from, room: space - used });
    const charm = drawn?.charm;
    if (!spend(db, server.key, user.id, charmedCost(charm, mode.energy, bar.points))) return reply("😮‍💨 You're exhausted.");
    drawn?.use();
    db.useAmmo(server.key, user.id, ammo.id);
    const charmed = charm ? `${kickedIn(charm)}\n` : '';

    const party = partyFor(db, server.key, user.id, mode.from, mode.tiers(gun));
    const found = charmedCatch(charm, party.yours, mode.from);
    let lines;
    if (!found.length) {
      lines = [`🔫 ${pick(mode.misses)}`];
    } else if (found[0].tier === 'hospital') {
      const bill = hospitalize(db, server.key, user.id);
      track.lost('hunting', bill.bill - bill.forgiven);
      lines = [`🏥 ${pick(mode.hurt)} ${billLine(bill)}`];
    } else {
      for (const item of found) {
        db.addItem(server.key, user.id, item.id);
        track.earned('hunting', item.price);
      }
      lines = found.map((item) => foundLine('🔫', user.name, 'bagged', item));
    }
    lines.push(...crewTrip(db, server.key, user.id, party, { energy: mode.energy, stream: 'hunting', emoji: '🔫', verb: 'bagged', track, prefix }));
    return reply(charmed + lines.join('\n'));
  },
};

// Out of ammo. With ?hunt settings ammo auto, a box for the gun follows in
// its own message, bought at full price (never with a Coupon) and only when
// it's affordable; without, the message ends with a tip about the setting.
async function outOfAmmo(gun, ammo, { prefix, user, server, db, track, reply }) {
  const out = `🔫 You're out of ammo. Buy more ${ammo.name} in \`${prefix}shop\`.`;
  if (!db.huntSettings(server.key, user.id).has('ammo')) {
    return reply(`${out}\nPro tip: \`${prefix}hunt settings ammo auto\` can allow the bot to automatically purchase and refill your ammo on your behalf.`);
  }
  await reply(out);
  const balance = db.cents(server.key, user.id);
  if (!db.buyAmmo(server.key, user.id, ammo.id, ammo.rounds, ammo.price)) {
    return reply(`📦 I couldn't automatically purchase more ammo for your ${gun.name}: it costs ${formatMoney(ammo.price)} and you only have ${formatMoney(balance)}.`);
  }
  track.lost('shop', ammo.price);
  return reply(`📦 I have automatically purchased more ammo for your ${gun.name} costing ${lost(ammo.price)}. You now have ${gained(db.cents(server.key, user.id))} left.`);
}

// `?hunt settings` lists them, `?hunt settings <name>` shows one,
// `?hunt settings <name> auto|off` changes it (`on` works for auto).
function settings(prefix, [name, value, ...extra], db, server, user) {
  const mine = db.huntSettings(server.key, user.id);
  const list = Object.entries(SETTINGS).map(([id, s]) =>
    `\`${prefix}hunt settings ${id} auto|off\` (now ${mine.has(id) ? 'auto' : 'off'}) · ${s.description}`);
  const menu = `⚙️ **Hunt settings**\n${list.join('\n')}`;
  if (!name) return menu;
  const id = matchAnswer(name, Object.keys(SETTINGS));
  if (!id) return `There's no hunt setting called **${name}**.\n\n${menu}`;

  const setting = SETTINGS[id];
  const now = mine.has(id) ? 'auto' : 'off';
  const other = now === 'auto' ? 'off' : 'auto';
  if (!value) return `It's ${now}: ${setting[now](prefix)}. Change it with \`${prefix}hunt settings ${id} ${other}\`.`;
  const want = !extra.length && matchAnswer(value, ['auto', 'off'], { on: 'auto' });
  if (!want) return `Usage: \`${prefix}hunt settings ${id} auto|off\``;
  return db.setHuntSetting(server.key, user.id, id, want === 'auto')
    ? `✅ Saved: ${setting[want](prefix)}.`
    : `Already ${want}: ${setting[want](prefix)}.`;
}
