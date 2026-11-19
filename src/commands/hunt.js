import { toolById, ammoById } from '../tools.js';
import { itemById, formatMoney } from '../items.js';
import { energyOf, spend, waitFor } from '../energy.js';
import { formatWait } from '../duration.js';
import { matchAnswer } from '../answers.js';
import { pick, rollTier, backpackFull, foundLine } from '../gather.js';
import { hospitalize } from '../hospital.js';
import { label } from '../storage.js';
import { gained, lost } from '../colors.js';

// High risk, high reward: a Hunting License, a gun and 1 round per hunt.
// Small game (any gun, 1 energy) pays a bit more than fishing with little
// risk; big game (a shotgun or better, 2 energy) pays about twice as much
// per energy but lands you in the hospital far more often. The gun only
// changes that hospital chance (the rest goes to missing), never the finds.
// For someone worth ~$50k, small game is ~$225 an energy and big game ~$440
// (fishing ~$210); big game stops paying at ~$150k worth with the shotgun,
// ~$190k with the rifle and ~$230k with the Barrett.
const MODES = {
  small: {
    energy: 1,
    game: 'small game',
    from: 'hunt_small',
    tiers: () => [
      { tier: 'hospital', weight: 3 },
      { tier: 'nothing', weight: 20 },
      { tier: 'common', weight: 45 },
      { tier: 'rare', weight: 25 },
      { tier: 'epic', weight: 7 },
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
    energy: 2,
    game: 'big game',
    from: 'hunt_big',
    tiers: (gun) => [
      { tier: 'hospital', weight: gun.hospital },
      { tier: 'nothing', weight: 41 - gun.hospital },
      { tier: 'common', weight: 25 },
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
  usage: ['small', 'big'],
  description: 'go hunting (needs a Hunting License, a gun and ammo from the shop): small game takes any gun and 1 energy, big game a shotgun or better and 2 energy, with a real risk of the hospital',
  // Per mode, for ?energy.
  energies: { small: MODES.small.energy, big: MODES.big.energy },
  cooldown: 5_000,
  economy: true,
  cooldownText: (wait) => `🔫 You're still reloading. Try again in ${wait}.`,
  async run({ prefix, args, user, server, db, track, reply, notHere }) {
    const mode = MODES[matchAnswer(args.join(' '), Object.keys(MODES))];
    if (!mode) return reply(`Usage: \`${prefix}hunt small\` (any gun, 1 energy) or \`${prefix}hunt big\` (a shotgun or better, 2 energy)`);
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
    if (!db.ammo(server.key, user.id).get(ammo.id)) return reply(`🔫 You're out of ammo. Buy more ${ammo.name} in \`${prefix}shop\`.`);
    const full = backpackFull(prefix, db, server.key, user.id);
    if (full) return reply(full);

    const bar = energyOf(db, server.key, user.id);
    if (bar.points < mode.energy) {
      return reply(`😮‍💨 You're exhausted. Hunting ${mode.game} takes ${mode.energy} energy and you have ${bar.points}. Enough in ${formatWait(waitFor(bar, mode.energy))}, or recover faster in \`${prefix}shop\`.`);
    }
    if (!spend(db, server.key, user.id, mode.energy)) return reply("😮‍💨 You're exhausted.");
    db.useAmmo(server.key, user.id, ammo.id);

    const found = rollTier(mode.tiers(gun), mode.from);
    if (!found) return reply(`🔫 ${pick(mode.misses)}`);
    if (found.tier === 'hospital') {
      const bill = hospitalize(db, server.key, user.id);
      track.lost('hunting', bill.bill - bill.forgiven);
      return reply(`🏥 ${pick(mode.hurt)} ${billLine(bill)}`);
    }
    db.addItem(server.key, user.id, found.id);
    track.earned('hunting', found.price);
    return reply(foundLine('🔫', user.name, 'bagged', found));
  },
};

// "Hospital bill: **$X**. You paid it in cash." and so on.
function billLine({ bill, cash, taken, change, forgiven }) {
  if (!bill || forgiven === bill) return "The hospital let you off: you've got nothing to pay with.";
  const head = `Hospital bill: **${lost(bill)}**.`;
  const rest = forgiven ? ` You couldn't cover the last ${formatMoney(forgiven)}, so the hospital let it go.` : '';
  if (!taken.length) return `${head} You paid ${forgiven ? lost(cash) : 'it'} in cash.${rest}`;
  const items = taken.map((t) => label(itemById.get(t.item), t.qty)).join(', ');
  const back = change ? ` (${gained(change)} back in change)` : '';
  return cash
    ? `${head} You paid ${lost(cash)} in cash and the hospital took ${items}${forgiven ? '' : ' for the rest'}${back}.${rest}`
    : `${head} You had no cash, so the hospital took ${items}${back}.${rest}`;
}
