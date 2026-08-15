import { setTimeout as delay } from "node:timers/promises";

/**
 * Converts an unknown thrown value into a human-readable error message.
 *
 * @param error - Any value caught from a rejected promise or `throw` statement.
 * @returns The original `Error.message`, or the value converted to a string.
 *
 * @example
 * ```ts
 * errorMessage(new Error("Connection failed")); // "Connection failed"
 * errorMessage("Unknown failure"); // "Unknown failure"
 * ```
 */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Pauses execution for the requested duration and supports early cancellation.
 *
 * @param milliseconds - Number of milliseconds to wait.
 * @param signal - Optional signal used to cancel the wait.
 * @throws An `AbortError` when the signal is aborted before the delay completes.
 *
 * @example
 * ```ts
 * const controller = new AbortController();
 * await sleep(250, controller.signal);
 * ```
 */
export async function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  await delay(milliseconds, undefined, signal === undefined ? {} : { signal });
}
