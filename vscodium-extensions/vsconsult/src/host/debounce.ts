/**
 * Creates a preview debouncer that delays calling the provided callback
 * until `delayMs` have elapsed since the last `schedule(id)` call.
 *
 * Rapid `schedule` calls reset the timer so only the final candidate
 * triggers a preview. `cancel()` clears the pending timer.
 *
 * The delay is read live via `getDelay()` on each `schedule`, so a
 * configuration change takes effect on the next schedule without
 * rebuilding the debouncer. `cancel()` clears the pending timer.
 */
export function createPreviewDebounce(
  callback: (id: string) => void | Promise<void>,
  getDelay: () => number,
): {
  schedule: (id: string) => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule(id: string): void {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      Promise.resolve(callback(id)).catch(() => {
        // Swallow errors from the async callback — the host handles
        // errors at a higher level.
      });
    }, getDelay());
  }

  function cancel(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  return { schedule, cancel };
}
