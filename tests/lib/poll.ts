export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  label?: string;
}

export async function pollUntil<T>(
  fn: () => T | Promise<T>,
  predicate: (result: T) => boolean,
  opts?: PollOptions
): Promise<T> {
  const intervalMs = opts?.intervalMs ?? 10_000;
  const timeoutMs = opts?.timeoutMs ?? 300_000;
  const label = opts?.label ?? "condition";

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await fn();
    if (predicate(result)) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}
