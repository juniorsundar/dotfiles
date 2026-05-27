import { describe, it, expect, afterAll } from "vitest";
import { parseAgentDefinition, parseAgentDefinitionFile } from "./agent-definition-parser";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("parseAgentDefinition", () => {
  it("parses a minimal agent definition with only name", () => {
    const input = `---
name: scout
---
You are a helpful agent.`;

    const result = parseAgentDefinition(input);

    expect(result.name).toBe("scout");
    expect(result.systemPromptBody).toBe("You are a helpful agent.");
    expect(result.systemPromptMode).toBe("replace");
    expect(result.inheritProjectContext).toBe(true);
    expect(result.inheritSkills).toBe(true);
    expect(result.inheritExtensions).toBe(true);
    expect(result.model).toBeUndefined();
    expect(result.tools).toBeUndefined();
    expect(result.timeout).toBeUndefined();
  });

  it("throws an error when name is missing from frontmatter", () => {
    const input = `---
description: An agent without a name
---
System prompt.`;

    expect(() => parseAgentDefinition(input)).toThrow(
      "Agent definition must include a non-empty 'name' field"
    );
  });

  it("throws an error when name is whitespace-only", () => {
    const input = `---
name:   
---
System prompt.`;

    expect(() => parseAgentDefinition(input)).toThrow(
      "Agent definition must include a non-empty 'name' field"
    );
  });

  it("parses tools specified as a YAML list (array form)", () => {
    const input = `---
name: scout
tools:
  - read
  - grep
  - bash
---
Body`;

    const result = parseAgentDefinition(input);

    expect(result.tools).toEqual(["read", "grep", "bash"]);
  });

  it("parses a complete agent definition with all known fields", () => {
    const input = `---
name: scout
description: Fast codebase recon
model: minimax/MiniMax-M2.7
tools: read, grep, bash, write
thinking: high
systemPromptMode: append
inheritProjectContext: false
inheritSkills: false
inheritExtensions: false
timeout: 120
output: .pi/subagent-outputs/scout.md
defaultProgress: true
---
You are a scout agent.`;

    const result = parseAgentDefinition(input);

    expect(result.name).toBe("scout");
    expect(result.description).toBe("Fast codebase recon");
    expect(result.model).toBe("minimax/MiniMax-M2.7");
    expect(result.tools).toEqual(["read", "grep", "bash", "write"]);
    expect(result.thinking).toBe("high");
    expect(result.systemPromptMode).toBe("append");
    expect(result.inheritProjectContext).toBe(false);
    expect(result.inheritSkills).toBe(false);
    expect(result.inheritExtensions).toBe(false);
    expect(result.timeout).toBe(120);
    expect(result.output).toBe(".pi/subagent-outputs/scout.md");
    expect(result.defaultProgress).toBe(true);
    expect(result.systemPromptBody).toBe("You are a scout agent.");
  });

  it("preserves unknown frontmatter fields without error", () => {
    const input = `---
name: test
defaultReads: agents/context.md
defaultContext: fork
customField: some-value
---
Test body.`;

    const result = parseAgentDefinition(input);

    expect(result.name).toBe("test");
    expect(result.extra).toBeDefined();
    expect(result.extra).toEqual({
      defaultReads: "agents/context.md",
      defaultContext: "fork",
      customField: "some-value",
    });
  });

  it("parses an agent definition with no markdown body (empty system prompt)", () => {
    const input = `---
name: silent
---`;

    const result = parseAgentDefinition(input);

    expect(result.name).toBe("silent");
    expect(result.systemPromptBody).toBe("");
  });

  it("handles multiline system prompt bodies with special characters", () => {
    const input = `---
name: test
---
Here is a $VARIABLE with "quotes" and \`backticks\`.
Also apostrophes: it's working.
And template literals: \${interpolated}.`;

    const result = parseAgentDefinition(input);

    expect(result.systemPromptBody).toContain('$VARIABLE');
    expect(result.systemPromptBody).toContain('"quotes"');
    expect(result.systemPromptBody).toContain('`backticks`');
    expect(result.systemPromptBody).toContain("it's working");
    expect(result.systemPromptBody).toContain('${interpolated}');
  });
});

describe("parseAgentDefinitionFile", () => {
  const agentsDir = mkdtempSync(join(tmpdir(), "pi-test-agents-"));
  writeFileSync(
    join(agentsDir, "scout.md"),
    `---
name: scout
description: Test agent
tools: read, grep
---
You are a scout.`
  );

  it("throws a clear error when the agent file does not exist", () => {
    expect(() =>
      parseAgentDefinitionFile("nonexistent-agent", agentsDir)
    ).toThrow(
      /Agent definition file not found for "nonexistent-agent" at .+nonexistent-agent\.md/
    );
  });

  it("reads and parses an agent definition from disk", () => {
    const result = parseAgentDefinitionFile("scout", agentsDir);

    expect(result.name).toBe("scout");
    expect(result.description).toBe("Test agent");
    expect(result.systemPromptBody).toBe("You are a scout.");
    expect(result.tools).toEqual(["read", "grep"]);
  });

  afterAll(() => {
    rmSync(agentsDir, { recursive: true, force: true });
  });
});

describe("error handling", () => {
  it("handles malformed YAML frontmatter with a descriptive error message", () => {
    const input = `---
name: [broken YAML
---
Body`;

    expect(() => parseAgentDefinition(input)).toThrow(
      /Failed to parse YAML frontmatter:/
    );
  });
});
