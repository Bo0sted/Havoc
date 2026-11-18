// Cooldown lengths as admins type them: 30sec, 5min, 2hr.
const UNITS = {
  sec: { ms: 1_000, max: 60 },
  min: { ms: 60_000, max: 60 },
  hr: { ms: 3_600_000, max: 24 },
};

// "30sec" or "30 sec" → milliseconds, or null when the format or range is wrong.
export function parseDuration(text) {
  const m = /^(\d+)\s*(sec|min|hr)$/i.exec(String(text).trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = UNITS[m[2].toLowerCase()];
  return n >= 1 && n <= unit.max ? n * unit.ms : null;
}

// Milliseconds → the largest unit that divides it evenly, e.g. 300000 → "5min".
export function formatDuration(ms) {
  if (!ms) return 'none';
  for (const [name, unit] of Object.entries(UNITS).reverse()) {
    if (ms % unit.ms === 0) return `${ms / unit.ms}${name}`;
  }
  return `${Math.ceil(ms / 1000)}sec`;
}

// Time left on a cooldown, rounded up: "12s", "4m 10s", "3h 5m".
export function formatWait(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 60)}h`;
}
