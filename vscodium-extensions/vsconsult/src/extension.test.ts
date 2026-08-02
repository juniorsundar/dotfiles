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

// ---------------------------------------------------------------------------
// Ticket 14 C1: Verify the vsconsult.pickPicker command is declared in the
// manifest and wired at activation to host.start("pick") with the chooser
// registered before any start can resolve it.
// ---------------------------------------------------------------------------

describe("vsconsult.pickPicker command wiring (C1)", () => {
  it("is declared in contributes.commands with title 'Choose Picker'", () => {
    const commands: Array<{ command: string; title?: string; category?: string }> = pkg.contributes.commands;
    const pickCmd = commands.find((c) => c.command === "vsconsult.pickPicker");
    expect(pickCmd).toBeDefined();
    expect(pickCmd!.category).toBe("vsconsult");
    expect(pickCmd!.title).toBe("Choose Picker");
  });

  it("is listed in activationEvents", () => {
    expect(pkg.activationEvents).toContain("onCommand:vsconsult.pickPicker");
  });

  it("does not add a new view, view-container, or view declaration", () => {
    // The existing shared webview view serves the chooser too.
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

describe("extension.ts — pickPicker command handler (C1)", () => {
  it("defines a pickPickerCommandId constant", () => {
    expect(extSrc).toMatch(/pickPickerCommandId\s*=\s*"vsconsult\.pickPicker"/);
  });

  it("registers the command with vscode.commands.registerCommand", () => {
    // The handler must call host.start("pick").
    expect(extSrc).toMatch(
      /registerCommand\(\s*pickPickerCommandId\s*,\s*\(\)\s*=>\s*host\.start\("pick"\)/,
    );
  });

  it("creates and registers the chooser at activation before start can resolve it", () => {
    // createPickPicker(registry) must appear in activate(); the chooser is
    // registered at assembly time, so this also guarantees host.start("pick")
    // finds it.
    expect(extSrc).toMatch(/createPickPicker\(\s*registry\s*\)/);
    expect(extSrc).toMatch(/import.*createPickPicker.*from "\.\/pickPicker\/index\.js"/s);
  });
});
