import { describe, it, expect } from "vitest";
import { buildCommand } from "./command-builder";
import type { AgentDefinition } from "./agent-definition-parser";

const MANIFEST_PATH = "/tmp/manifest.json";

function makeDefinition(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    name: "scout",
    systemPromptMode: "replace",
    systemPromptBody: "",
    inheritProjectContext: true,
    inheritSkills: true,
    inheritExtensions: true,
    ...overrides,
  };
}

describe("buildCommand", () => {
  it("produces the basic structure with --mode json, --no-session, PI_SUBAGENT_CHILD, and manifest", () => {
    const result = buildCommand(makeDefinition(), "Find all .ts files", MANIFEST_PATH);

    expect(result.args).toContain("--mode");
    expect(result.args).toContain("json");
    expect(result.args).toContain("--no-session");
    expect(result.args).toContain("-p");
    expect(result.args).toContain(MANIFEST_PATH);
    expect(result.env.PI_SUBAGENT_CHILD).toBe("1");
    expect(result.manifest.task).toBe("Find all .ts files");
  });

  describe("system prompt modes", () => {
    it("uses --system-prompt when systemPromptMode is replace", () => {
      const result = buildCommand(
        makeDefinition({ systemPromptMode: "replace", systemPromptBody: "You are a worker" }),
        "Do stuff",
        MANIFEST_PATH,
      );

      expect(result.args).toContain("--system-prompt");
      expect(result.args).toContain(MANIFEST_PATH);
      expect(result.args).not.toContain("--append-system-prompt");
      expect(result.manifest.systemPrompt).toBe("You are a worker");
    });

    it("uses --append-system-prompt when systemPromptMode is append", () => {
      const result = buildCommand(
        makeDefinition({ systemPromptMode: "append", systemPromptBody: "Also: follow these rules" }),
        "Do stuff",
        MANIFEST_PATH,
      );

      expect(result.args).toContain("--append-system-prompt");
      expect(result.args).toContain(MANIFEST_PATH);
      expect(result.args).not.toContain("--system-prompt");
      expect(result.manifest.systemPrompt).toBe("Also: follow these rules");
    });

    it("does not include systemPrompt in manifest when systemPromptBody is empty", () => {
      const result = buildCommand(
        makeDefinition({ systemPromptBody: "" }),
        "Do stuff",
        MANIFEST_PATH,
      );

      expect(result.manifest.systemPrompt).toBeUndefined();
    });
  });

  describe("tools", () => {
    it("produces --tools with comma-separated names when tools are defined", () => {
      const result = buildCommand(
        makeDefinition({ tools: ["read", "grep", "find", "ls", "bash"] }),
        "Do stuff",
        MANIFEST_PATH,
      );

      const toolsIndex = result.args.indexOf("--tools");
      expect(toolsIndex).toBeGreaterThan(-1);
      expect(result.args[toolsIndex + 1]).toBe("read,grep,find,ls,bash");
    });

    it("omits --tools when tools are not defined", () => {
      const result = buildCommand(makeDefinition(), "Do stuff", MANIFEST_PATH);

      expect(result.args).not.toContain("--tools");
    });

    it("omits --tools when tools array is empty", () => {
      const result = buildCommand(
        makeDefinition({ tools: [] }),
        "Do stuff",
        MANIFEST_PATH,
      );

      expect(result.args).not.toContain("--tools");
    });
  });

  describe("model and thinking", () => {
    it("uses --model from agent definition when no override", () => {
      const result = buildCommand(
        makeDefinition({ model: "anthropic/claude-sonnet" }),
        "Do stuff",
        MANIFEST_PATH,
      );

      const modelIndex = result.args.indexOf("--model");
      expect(modelIndex).toBeGreaterThan(-1);
      expect(result.args[modelIndex + 1]).toBe("anthropic/claude-sonnet");
    });

    it("uses --thinking from agent definition when no override", () => {
      const result = buildCommand(
        makeDefinition({ thinking: "high" }),
        "Do stuff",
        MANIFEST_PATH,
      );

      const thinkingIndex = result.args.indexOf("--thinking");
      expect(thinkingIndex).toBeGreaterThan(-1);
      expect(result.args[thinkingIndex + 1]).toBe("high");
    });

    it("combines model and thinking from definition", () => {
      const result = buildCommand(
        makeDefinition({ model: "anthropic/claude-sonnet", thinking: "high" }),
        "Do stuff",
        MANIFEST_PATH,
      );

      expect(result.args).toContain("--model");
      expect(result.args).toContain("--thinking");
    });

    it("tool-level model override takes precedence over definition model", () => {
      const result = buildCommand(
        makeDefinition({ model: "openai/gpt-4" }),
        "Do stuff",
        MANIFEST_PATH,
        { model: "anthropic/claude-opus" },
      );

      const modelIndex = result.args.indexOf("--model");
      expect(result.args[modelIndex + 1]).toBe("anthropic/claude-opus");
    });

    it("tool-level thinking override takes precedence over definition thinking", () => {
      const result = buildCommand(
        makeDefinition({ thinking: "low" }),
        "Do stuff",
        MANIFEST_PATH,
        { thinking: "xhigh" },
      );

      const thinkingIndex = result.args.indexOf("--thinking");
      expect(result.args[thinkingIndex + 1]).toBe("xhigh");
    });

    it("omits --model and --thinking when neither definition nor override has them", () => {
      const result = buildCommand(makeDefinition(), "Do stuff", MANIFEST_PATH);

      expect(result.args).not.toContain("--model");
      expect(result.args).not.toContain("--thinking");
    });

    it("omits --model when only thinking is specified", () => {
      const result = buildCommand(
        makeDefinition({ thinking: "medium" }),
        "Do stuff",
        MANIFEST_PATH,
      );

      expect(result.args).not.toContain("--model");
      expect(result.args).toContain("--thinking");
    });

    it("omits --model when model defined but override explicitly sets it to empty", () => {
      // Edge case: if override explicitly passes empty string
      const result = buildCommand(
        makeDefinition({ model: "openai/gpt-4" }),
        "Do stuff",
        MANIFEST_PATH,
        { model: "" },
      );

      // override (even empty string) takes precedence — empty model = no flag
      expect(result.args).not.toContain("--model");
    });
  });

  describe("inheritance flags", () => {
    it("includes --no-context-files when inheritProjectContext is false", () => {
      const result = buildCommand(
        makeDefinition({ inheritProjectContext: false }),
        "Do stuff",
        MANIFEST_PATH,
      );

      expect(result.args).toContain("--no-context-files");
    });

    it("omits --no-context-files when inheritProjectContext is true", () => {
      const result = buildCommand(
        makeDefinition({ inheritProjectContext: true }),
        "Do stuff",
        MANIFEST_PATH,
      );

      expect(result.args).not.toContain("--no-context-files");
    });

    it("includes --no-skills when inheritSkills is false", () => {
      const result = buildCommand(
        makeDefinition({ inheritSkills: false }),
        "Do stuff",
        MANIFEST_PATH,
      );

      expect(result.args).toContain("--no-skills");
    });

    it("omits --no-skills when inheritSkills is true", () => {
      const result = buildCommand(
        makeDefinition({ inheritSkills: true }),
        "Do stuff",
        MANIFEST_PATH,
      );

      expect(result.args).not.toContain("--no-skills");
    });

    it("includes --no-extensions when inheritExtensions is false", () => {
      const result = buildCommand(
        makeDefinition({ inheritExtensions: false }),
        "Do stuff",
        MANIFEST_PATH,
      );

      expect(result.args).toContain("--no-extensions");
    });

    it("omits --no-extensions when inheritExtensions is true", () => {
      const result = buildCommand(
        makeDefinition({ inheritExtensions: true }),
        "Do stuff",
        MANIFEST_PATH,
      );

      expect(result.args).not.toContain("--no-extensions");
    });
  });

  describe("manifest special characters", () => {
    it("preserves quotes and special characters in systemPromptBody in manifest", () => {
      const body = `Here is "quoted" text with 'apostrophes' and $dollar signs.`;
      const result = buildCommand(
        makeDefinition({ systemPromptMode: "replace", systemPromptBody: body }),
        "Do stuff",
        MANIFEST_PATH,
      );

      expect(result.manifest.systemPrompt).toBe(body);
      // JSON round-trip should not corrupt
      const json = JSON.stringify(result.manifest);
      const parsed = JSON.parse(json);
      expect(parsed.systemPrompt).toBe(body);
    });

    it("preserves backticks and template literals in systemPromptBody in manifest", () => {
      const body = "Use \`backticks\` and \${templateLiterals} here.";
      const result = buildCommand(
        makeDefinition({ systemPromptMode: "replace", systemPromptBody: body }),
        "Do stuff",
        MANIFEST_PATH,
      );

      expect(result.manifest.systemPrompt).toBe(body);
      const json = JSON.stringify(result.manifest);
      const parsed = JSON.parse(json);
      expect(parsed.systemPrompt).toBe(body);
    });

    it("preserves newlines in systemPromptBody in manifest", () => {
      const body = "Line 1\nLine 2\nLine 3";
      const result = buildCommand(
        makeDefinition({ systemPromptMode: "replace", systemPromptBody: body }),
        "Do stuff",
        MANIFEST_PATH,
      );

      expect(result.manifest.systemPrompt).toBe(body);
      const json = JSON.stringify(result.manifest);
      const parsed = JSON.parse(json);
      expect(parsed.systemPrompt).toBe(body);
    });

    it("preserves special characters in task in manifest", () => {
      const task = 'Task with "quotes", $vars, and \`backticks\`.';
      const result = buildCommand(makeDefinition(), task, MANIFEST_PATH);

      expect(result.manifest.task).toBe(task);
      const json = JSON.stringify(result.manifest);
      const parsed = JSON.parse(json);
      expect(parsed.task).toBe(task);
    });
  });

  describe("full integration", () => {
    it("produces every applicable flag for a complete agent definition", () => {
      const result = buildCommand(
        makeDefinition({
          systemPromptMode: "replace",
          systemPromptBody: "You are a code reviewer.",
          tools: ["read", "grep", "bash", "edit"],
          model: "anthropic/claude-sonnet",
          thinking: "high",
          inheritProjectContext: false,
          inheritSkills: false,
          inheritExtensions: false,
        }),
        "Review the code in src/",
        MANIFEST_PATH,
      );

      // Always-present flags
      expect(result.args).toContain("--mode");
      expect(result.args).toContain("json");
      expect(result.args).toContain("--no-session");
      expect(result.env.PI_SUBAGENT_CHILD).toBe("1");

      // Task prompt
      expect(result.args).toContain("-p");
      expect(result.args).toContain(MANIFEST_PATH);
      expect(result.manifest.task).toBe("Review the code in src/");

      // System prompt
      expect(result.args).toContain("--system-prompt");
      expect(result.manifest.systemPrompt).toBe("You are a code reviewer.");

      // Tools
      const toolsIndex = result.args.indexOf("--tools");
      expect(toolsIndex).toBeGreaterThan(-1);
      expect(result.args[toolsIndex + 1]).toBe("read,grep,bash,edit");

      // Model and thinking
      expect(result.args).toContain("--model");
      expect(result.args).toContain("anthropic/claude-sonnet");
      expect(result.args).toContain("--thinking");
      expect(result.args).toContain("high");

      // Inheritance flags (all false → all present)
      expect(result.args).toContain("--no-context-files");
      expect(result.args).toContain("--no-skills");
      expect(result.args).toContain("--no-extensions");
    });

    it("tool-level overrides take precedence in full context", () => {
      const result = buildCommand(
        makeDefinition({
          systemPromptMode: "append",
          systemPromptBody: "Extra rules here.",
          tools: ["read", "write"],
          model: "openai/gpt-4",
          thinking: "low",
          inheritProjectContext: true,
          inheritSkills: false,
          inheritExtensions: true,
        }),
        "Write a function",
        MANIFEST_PATH,
        { model: "anthropic/claude-opus", thinking: "xhigh" },
      );

      // Override model/thinking win
      const modelIndex = result.args.indexOf("--model");
      expect(result.args[modelIndex + 1]).toBe("anthropic/claude-opus");
      const thinkingIndex = result.args.indexOf("--thinking");
      expect(result.args[thinkingIndex + 1]).toBe("xhigh");

      // Definition-only fields still present
      expect(result.args).toContain("--append-system-prompt");
      expect(result.manifest.systemPrompt).toBe("Extra rules here.");

      const toolsIndex = result.args.indexOf("--tools");
      expect(result.args[toolsIndex + 1]).toBe("read,write");

      // Inheritance: only inheritSkills is false
      expect(result.args).toContain("--no-skills");
      expect(result.args).not.toContain("--no-context-files");
      expect(result.args).not.toContain("--no-extensions");
    });

    it("omits system prompt and tools flags when not configured", () => {
      const result = buildCommand(makeDefinition(), "Just a task", MANIFEST_PATH);

      expect(result.args).not.toContain("--system-prompt");
      expect(result.args).not.toContain("--append-system-prompt");
      expect(result.args).not.toContain("--tools");
      expect(result.args).not.toContain("--model");
      expect(result.args).not.toContain("--thinking");
      expect(result.args).not.toContain("--no-context-files");
      expect(result.args).not.toContain("--no-skills");
      expect(result.args).not.toContain("--no-extensions");
      expect(result.manifest.systemPrompt).toBeUndefined();

      // Still has the always-present bits
      expect(result.args).toContain("--mode");
      expect(result.args).toContain("json");
      expect(result.args).toContain("--no-session");
      expect(result.env.PI_SUBAGENT_CHILD).toBe("1");
    });
  });
});
