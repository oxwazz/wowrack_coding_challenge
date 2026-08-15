import { setTimeout as delay } from "node:timers/promises";

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export async function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  await delay(milliseconds, undefined, signal === undefined ? {} : { signal });
}
