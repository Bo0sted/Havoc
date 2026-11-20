// Per-person, per-command cooldowns. The length is the server's override if
// an admin set one, otherwise the command's default. Last-use times live in
// memory, so a restart resets them.
const DAY = 86_400_000; // longer than any cooldown can be

export function createCooldowns(db) {
  const lastUse = new Map();
  // Command name → recent use times across every server and person, for
  // commands whose API only allows so many requests (rateLimit).
  const globalUses = new Map();

  // The cooldown a command has on a server right now.
  const lengthOf = (server, cmd) => db.overrides(server).get(cmd.name) ?? cmd.cooldown ?? 0;

  return {
    lengthOf,
    // Milliseconds left to wait, or 0 (and the use is recorded).
    take(server, cmd, userId) {
      const length = lengthOf(server, cmd);
      if (!length) return 0;
      const key = `${server}\n${cmd.name}\n${userId}`;
      const left = (lastUse.get(key) ?? 0) + length - Date.now();
      if (left > 0) return left;
      lastUse.set(key, Date.now());
      return 0;
    },
    // Milliseconds left to wait, without using the command (0 when ready).
    remaining(server, cmd, userId) {
      const length = lengthOf(server, cmd);
      return length ? Math.max(0, (lastUse.get(`${server}\n${cmd.name}\n${userId}`) ?? 0) + length - Date.now()) : 0;
    },
    // Milliseconds until the command's API allows another request, or 0
    // (and the use is recorded). Applies to everyone, admins included.
    takeGlobal(cmd) {
      if (!cmd.rateLimit) return 0;
      const { max, per } = cmd.rateLimit;
      const now = Date.now();
      const recent = (globalUses.get(cmd.name) ?? []).filter((at) => now - at < per);
      globalUses.set(cmd.name, recent);
      if (recent.length >= max) return recent[0] + per - now;
      recent.push(now);
      return 0;
    },
    // Makes the person's current wait exactly ms from now (e.g. a shorter
    // cooldown after a win).
    setRemaining(server, cmd, userId, ms) {
      lastUse.set(`${server}\n${cmd.name}\n${userId}`, Date.now() + ms - lengthOf(server, cmd));
    },
    prune(now = Date.now()) {
      for (const [key, at] of lastUse) if (now - at > DAY) lastUse.delete(key);
    },
  };
}
