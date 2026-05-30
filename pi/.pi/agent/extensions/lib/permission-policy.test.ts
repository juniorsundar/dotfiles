import { describe, expect, it } from "vitest";
import {
  evaluateConfirmation,
  evaluatePermission,
  isCatastrophicBash,
  isProtectedPath,
  parseProfile,
} from "./permission-policy";

describe("permission policy", () => {
  it("parses known profiles and rejects unknown values", () => {
    expect(parseProfile("safe")).toBe("safe");
    expect(parseProfile(" ASK ")).toBe("ask");
    expect(parseProfile("yolo")).toBe("yolo");
    expect(parseProfile("dangerous")).toBeUndefined();
  });

  it("detects protected paths", () => {
    expect(isProtectedPath(".env")).toBe(true);
    expect(isProtectedPath("/home/me/.ssh/config")).toBe(true);
    expect(isProtectedPath("src/node_modules/pkg/index.js")).toBe(true);
    expect(isProtectedPath("src/app.ts")).toBe(false);
  });

  it("blocks protected edit/write paths for every profile", () => {
    for (const profile of ["safe", "ask", "yolo"] as const) {
      expect(
        evaluatePermission(profile, "edit", { path: ".env.local" }).action,
      ).toBe("block");
      expect(
        evaluateConfirmation(profile, "write", { path: ".ssh/config" }).action,
      ).toBe("block");
    }
  });

  it("blocks lockfile edits in safe mode only", () => {
    expect(
      evaluatePermission("safe", "edit", { path: "package-lock.json" }),
    ).toMatchObject({ action: "block" });
    expect(
      evaluatePermission("ask", "edit", { path: "package-lock.json" }),
    ).toEqual({ action: "allow" });
    expect(
      evaluatePermission("yolo", "edit", { path: "package-lock.json" }),
    ).toEqual({ action: "allow" });
  });

  it("classifies dangerous and catastrophic shell commands", () => {
    expect(isCatastrophicBash("git reset --hard HEAD")).toBe(true);
    expect(isCatastrophicBash("rm -rf /")).toBe(true);
    expect(isCatastrophicBash("sudo systemctl restart nginx")).toBe(false);
  });

  it("blocks risky shell in safe mode, prompts in ask mode, and allows non-catastrophic risky shell in yolo", () => {
    const input = { command: "sudo systemctl restart nginx" };

    expect(evaluatePermission("safe", "bash", input)).toMatchObject({
      action: "block",
    });
    expect(evaluatePermission("ask", "bash", input)).toMatchObject({
      action: "prompt",
    });
    expect(evaluatePermission("yolo", "bash", input)).toEqual({
      action: "allow",
    });
  });

  it("still blocks catastrophic shell in yolo", () => {
    expect(
      evaluatePermission("yolo", "bash", { command: "git clean -fd" }),
    ).toMatchObject({ action: "block" });
    expect(
      evaluateConfirmation("yolo", "bash", { command: "rm -rf /" }),
    ).toMatchObject({ action: "block" });
  });

  it("bypasses normal edit/write/bash confirmations in yolo", () => {
    expect(
      evaluateConfirmation("yolo", "edit", { path: "src/app.ts" }),
    ).toEqual({ action: "bypass" });
    expect(
      evaluateConfirmation("yolo", "write", { path: "README.md" }),
    ).toEqual({ action: "bypass" });
    expect(
      evaluateConfirmation("yolo", "bash", { command: "npm test" }),
    ).toEqual({ action: "bypass" });
  });

  it("keeps confirmations for non-yolo normal mutations", () => {
    expect(
      evaluateConfirmation("ask", "edit", { path: "src/app.ts" }),
    ).toEqual({ action: "confirm" });
    expect(
      evaluateConfirmation("safe", "bash", { command: "npm test" }),
    ).toEqual({ action: "confirm" });
  });
});
