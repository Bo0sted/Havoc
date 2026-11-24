// Where people's money comes from and goes, per stream, for ?stats extra.
// Totals only ever go up: earning adds to `earned`, losing to `lost`, and
// nothing is ever taken back off either. Catches count at their value when
// caught (selling them later just turns them into cash). A new way to make
// or lose money only needs a stream here and a track call where it happens.

// When tracking started (the owner's exact Haven timestamp, shown as a date).
// Everything people had before then is their 'before' amount.
export const TRACKING_START = '<t:1795116600:D>';

export const STREAMS = {
  fishing: { label: 'Fishing', emoji: '🎣' },
  mining: { label: 'Mining', emoji: '⛏️' },
  hunting: { label: 'Hunting', emoji: '🔫', lost: 'lost to hospital bills' },
  daily: { label: 'Daily', emoji: '💵' },
  lottery: { label: 'Lottery', emoji: '🎟️' },
  hangman: { label: 'Hangman', emoji: '🔤', lost: 'lost in penalties' },
  betting: { label: 'Betting', emoji: '🎲' },
  promos: { label: 'Promos', emoji: '🎁' },
  gifts: { label: 'Gifts', emoji: '🤝', earned: 'received', lost: 'given' },
  milestones: { label: 'Milestones', emoji: '🏅' },
  shop: { label: 'Shop', emoji: '🛒', lost: 'spent' },
  crew: { label: 'Crew', emoji: '👷', lost: 'spent on hiring and payroll' },
  wheel: { label: 'Wheel', emoji: '🎡' },
  charms: { label: 'Charms', emoji: '🍀' },
};

// One command run's view of the ledger. Anything that gains or loses money
// goes through it, which is also how the router knows the run counts toward
// milestones (`moved`). `moved()` alone marks money that changed form, like
// selling, without counting it as earned.
export function tracker(db, server, userId) {
  let moved = false;
  return {
    earned: (stream, cents) => { if (cents > 0) { moved = true; db.earn(server, userId, stream, cents); } },
    lost: (stream, cents) => { if (cents > 0) { moved = true; db.lose(server, userId, stream, cents); } },
    moved: () => { moved = true; },
    get didMove() { return moved; },
  };
}
