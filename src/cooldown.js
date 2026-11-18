// Per-user cooldowns, kept in memory (they reset when Havoc restarts).
export function cooldown(ms) {
  const last = new Map();
  return (userId) => {
    const now = Date.now();
    const wait = (last.get(userId) ?? 0) + ms - now;
    if (wait > 0) return Math.ceil(wait / 1000);
    last.set(userId, now);
    return 0;
  };
}
