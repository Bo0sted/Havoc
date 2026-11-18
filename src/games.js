// One interactive game (lottery, bet) per person per server at a time, so
// two games never wait on the same person's answer.
const active = new Set();

// A release function, or null if they're already playing something.
export function claimGame(serverKey, userId) {
  const key = `${serverKey}\n${userId}`;
  if (active.has(key)) return null;
  active.add(key);
  return () => active.delete(key);
}
