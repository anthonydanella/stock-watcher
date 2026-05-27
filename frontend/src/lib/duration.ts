const DURATION_UNIT_FACTORS: Record<string, number> = {
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1
};

const DURATION_TOKEN = /(\d+(?:\.\d+)?)\s*([a-z]+)?/gi;

export function parseDuration(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // A bare number is treated as minutes — the natural unit for stock checks.
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return Math.max(0, Math.round(Number(trimmed) * 60));
  }
  let total = 0;
  let matched = false;
  for (const m of trimmed.matchAll(DURATION_TOKEN)) {
    const n = Number(m[1]);
    const factor = m[2] ? DURATION_UNIT_FACTORS[m[2].toLowerCase()] : undefined;
    if (!Number.isFinite(n) || factor == null) return null;
    total += n * factor;
    matched = true;
  }
  return matched ? Math.round(total) : null;
}

export function formatDuration(seconds: number | undefined | null): string {
  if (seconds == null || seconds <= 0) return "";
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}
