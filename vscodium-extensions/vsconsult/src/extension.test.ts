import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Ticket 13 C1: Verify package.json manifest declares the grep command
// with no new view/view-container/view entries.
// ---------------------------------------------------------------------------

const pkgPath = resolve(__dirname, "../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

describe("vsconsult.liveGrep command wiring (C1)", () => {
  it("is declared in contributes.commands", () => {
    const commands: Array<{ command: string; title?: string; category?: string }> = pkg.contributes.commands;
    const grepCmd = commands.find((c) => c.command === "vsconsult.liveGrep");
    expect(grepCmd).toBeDefined();
    expect(grepCmd!.category).toBe("vsconsult");
    expect(grepCmd!.title).toBe("Live Grep");
  });

  it("is listed in activationEvents", () => {
    expect(pkg.activationEvents).toContain("onCommand:vsconsult.liveGrep");
  });

  it("does not add a new view, view-container, or view declaration", () => {
    // The existing shared webview view (vsconsult-filePicker) serves the
    // grep picker too. No new entries in views or viewsContainers.
    const panelViews: Array<{ id: string }> =
      pkg.contributes.views?.["vsconsult-panel"] ?? [];
    expect(panelViews).toHaveLength(1);
    expect(panelViews[0].id).toBe("vsconsult-filePicker");

    const panelContainers: Array<{ id: string }> =
      pkg.contributes.viewsContainers?.panel ?? [];
    expect(panelContainers).toHaveLength(1);
    expect(panelContainers[0].id).toBe("vsconsult-panel");
  });
});

// ---------------------------------------------------------------------------
// Ticket 13 C1 (cont): Verify extension.ts source registers the command
// handler with host.start("grep") — structural verification of the wiring
// pattern, which mirrors the existing findFile command.
// ---------------------------------------------------------------------------

const extSrc = readFileSync(resolve(__dirname, "extension.ts"), "utf8");

describe("extension.ts — grep command handler (C1)", () => {
  it("defines a liveGrepCommandId constant", () => {
    expect(extSrc).toMatch(/liveGrepCommandId\s*=\s*"vsconsult\.liveGrep"/);
  });

  it("registers the command with vscode.commands.registerCommand", () => {
    // The handler must call host.start("grep").
    expect(extSrc).toMatch(
      /registerCommand\(\s*liveGrepCommandId\s*,\s*\(\)\s*=>\s*host\.start\("grep"\)/,
    );
  });
});
