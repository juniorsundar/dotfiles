/**
 * Creates a preview debouncer that delays calling the provided callback
 * until `delayMs` have elapsed since the last `schedule(id)` call.
 *
 * Rapid `schedule` calls reset the timer so only the final candidate
 * triggers a preview. `cancel()` clears the pending timer.
 */
export function createPreviewDebounce(
  callback: (id: string) => void | Promise<void>,
  delayMs: number,
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
    }, delayMs);
  }

  function cancel(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  return { schedule, cancel };
}
