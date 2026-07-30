import { describe, expect, it, vi } from "vitest";

import { runCancel, runExit } from "./lifecycle.js";
import type { HostEnv, Origin } from "./lifecycle.js";

// ---------------------------------------------------------------------------
// Fake HostEnv that records calls
// ---------------------------------------------------------------------------

function fakeEnv(): HostEnv & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    restoreOrigin: vi.fn(async (origin: Origin) => {
      calls.push(`restoreOrigin:${origin.uri}`);
    }),
    focusActiveEditorGroup: vi.fn(async () => {
      calls.push("focusActiveEditorGroup");
    }),
    closePanel: vi.fn(async () => {
      calls.push("closePanel");
    }),
  };
}

// ---------------------------------------------------------------------------
// runCancel
// ---------------------------------------------------------------------------

describe("runCancel", () => {
  it("restores origin when origin exists", async () => {
    const env = fakeEnv();
    const origin: Origin = {
      uri: "/project/src/main.ts",
      selection: { line: 10, character: 5 },
      viewColumn: 1,
    };

    await runCancel(env, origin);

    expect(env.restoreOrigin).toHaveBeenCalledOnce();
    expect(env.restoreOrigin).toHaveBeenCalledWith(origin);
    expect(env.focusActiveEditorGroup).not.toHaveBeenCalled();
    expect(env.closePanel).not.toHaveBeenCalled(); // exit is separate
  });

  it("focuses the active editor group when no origin", async () => {
    const env = fakeEnv();

    await runCancel(env, undefined);

    expect(env.focusActiveEditorGroup).toHaveBeenCalledOnce();
    expect(env.restoreOrigin).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runExit
// ---------------------------------------------------------------------------

describe("runExit", () => {
  it("closes the panel when it was not visible before invocation", async () => {
    const env = fakeEnv();

    await runExit(env, false);

    expect(env.closePanel).toHaveBeenCalledOnce();
  });

  it("does not close the panel when it was already visible", async () => {
    const env = fakeEnv();

    await runExit(env, true);

    expect(env.closePanel).not.toHaveBeenCalled();
  });
});
