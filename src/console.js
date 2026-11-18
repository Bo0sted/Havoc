// Keeps the last lines Havoc printed (logs, warnings, errors, Node's own
// warnings) for ?console. Imported first in index.js so nothing is missed.
export const MAX_LINES = 100;
const lines = [];
const partial = { stdout: '', stderr: '' };
const ANSI_RE = /\x1b\[[0-9;]*m/g;

for (const name of ['stdout', 'stderr']) {
  const stream = process[name];
  const write = stream.write.bind(stream);
  stream.write = (chunk, ...rest) => {
    try {
      const text = partial[name] + String(chunk).replace(ANSI_RE, '');
      const parts = text.split('\n');
      partial[name] = parts.pop();
      const time = new Date().toTimeString().slice(0, 8);
      for (const line of parts) lines.push(`${time} ${line}`);
      if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
    } catch {
      // Recording must never stop the output itself.
    }
    return write(chunk, ...rest);
  };
}

// The last `n` lines (all kept ones without n), oldest first.
export function recentLines(n = MAX_LINES) {
  return lines.slice(-n);
}
