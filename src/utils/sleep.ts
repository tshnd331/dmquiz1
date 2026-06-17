/** Pause execution for the given number of milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sleep a random duration between `minMs` and `maxMs` (inclusive-ish).
 * Used to be polite while crawling.
 */
export function sleepRandom(minMs: number, maxMs: number): Promise<void> {
  const span = Math.max(0, maxMs - minMs);
  const ms = minMs + Math.floor(Math.random() * (span + 1));
  return sleep(ms);
}
