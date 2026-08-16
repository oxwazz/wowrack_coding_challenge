/** Validates an optional per-attempt timeout in milliseconds. */
export function validateMaxTimeout(
  maxTimeout: number | undefined,
  label: string,
): void {
  if (
    maxTimeout !== undefined
    && (!Number.isFinite(maxTimeout) || maxTimeout < 0)
  ) {
    throw new Error(`${label} must be a non-negative number in milliseconds`);
  }
}
