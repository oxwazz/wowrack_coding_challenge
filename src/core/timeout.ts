/** Validates an optional per-attempt timeout in seconds. */
export function validateMaxTimeout(
  maxTimeout: number | undefined,
  label: string,
): void {
  if (
    maxTimeout !== undefined
    && (!Number.isFinite(maxTimeout) || maxTimeout < 0)
  ) {
    throw new Error(`${label} must be a non-negative number in seconds`);
  }
}

/** Converts a configured timeout in seconds to the millisecond timer unit. */
export function maxTimeoutToMilliseconds(
  maxTimeout: number | undefined,
): number | undefined {
  return maxTimeout === undefined ? undefined : maxTimeout * 1_000;
}
