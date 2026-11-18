// Per-person, per-command cooldowns. The length is the server's override if
// an admin set one, otherwise the command's default. Last-use times live in
// memory, so a restart resets them.
const DAY = 86_400_000; // longer than any cooldown can be

export function createCooldowns(db) {
  const lastUse = new Map();

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
    prune(now = Date.now()) {
      for (const [key, at] of lastUse) if (now - at > DAY) lastUse.delete(key);
    },
  };
}
