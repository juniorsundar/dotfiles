import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { createPreviewDebounce } from "./debounce.js";

describe("createPreviewDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires the callback after the delay when schedule is called", () => {
    const spy = vi.fn();
    const debounce = createPreviewDebounce(spy, 100);

    debounce.schedule("alpha");

    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("alpha");
  });

  it("suppresses earlier calls when schedule is called again within the delay", () => {
    const spy = vi.fn();
    const debounce = createPreviewDebounce(spy, 100);

    debounce.schedule("alpha");
    vi.advanceTimersByTime(60);
    debounce.schedule("beta");

    // Alpha's timer was reset by beta at t=60. Advance from beta's schedule
    // by the full delay to trigger it.
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("beta");
  });

  it("fires the last call when rapid scheduling occurs", () => {
    const spy = vi.fn();
    const debounce = createPreviewDebounce(spy, 100);

    debounce.schedule("alpha");
    debounce.schedule("beta");
    debounce.schedule("gamma");
    debounce.schedule("delta");

    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("delta");
  });

  it("does not fire after cancel", () => {
    const spy = vi.fn();
    const debounce = createPreviewDebounce(spy, 100);

    debounce.schedule("alpha");
    debounce.cancel();

    vi.advanceTimersByTime(100);
    expect(spy).not.toHaveBeenCalled();
  });

  it("schedule after cancel still fires", () => {
    const spy = vi.fn();
    const debounce = createPreviewDebounce(spy, 100);

    debounce.schedule("alpha");
    debounce.cancel();
    debounce.schedule("beta");

    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("beta");
  });
});
