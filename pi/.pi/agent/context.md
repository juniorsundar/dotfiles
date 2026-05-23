# pi-subagents Extension Documentation

## Files Retrieved

1. `README.md` (lines 1-920) - Complete reference documentation
2. `skills/pi-subagents/SKILL.md` (lines 180-230) - Override examples
3. `src/shared/types.ts` (lines 36-77) - Override field types
4. `src/agents/agents.ts` (lines 36-77, 290-360) - Agent override parsing
5. `test/integration/async-status.test.ts` (line 68) - Local model example
6. `CHANGELOG.md` (line 243) - llama.cpp support note

## Key Code

### Creating a Custom Agent with a Specific Model (Markdown File)

Agent files are markdown with YAML frontmatter:

```yaml
---
name: scout
description: Fast codebase recon
model: anthropic/claude-sonnet-4-5
fallbackModels: openai/gpt-5-mini, anthropic/claude-haiku-4-5
thinking: high
tools: read, grep, find, ls, bash
systemPromptMode: replace
inheritProjectContext: false
inheritSkills: false
---

Your system prompt goes here.
```

**Agent file locations (lowest to highest priority):**
| Scope | Path |
|-------|------|
| Builtin | `~/.pi/agent/extensions/subagent/agents/` |
| User | `~/.pi/agent/agents/**/*.md` |
| Project | `.pi/agents/**/*.md` |

### Local Models (llama.cpp, Ollama)

**Supported.** The CHANGELOG explicitly notes:
> "Flexible `subagent` tool schema fields now include explicit JSON Schema types so llama.cpp and local OpenAI-compatible providers accept them."

**Example from tests:**
```typescript
{ agent: "local", model: "ollama/qwen2.5-coder:7b" }
```

**How it works:**
- Model is a simple string field (`provider/model-name`)
- Works with any OpenAI-compatible API endpoint
- Common formats: `ollama/llama3`, `llamacpp/phi-3`, `openai-compatible/local-model`

### settings.json Subagents Config

**User scope:** `~/.pi/agent/settings.json`
**Project scope:** `.pi/settings.json`

**Override builtin agent model:**

```json
{
  "subagents": {
    "agentOverrides": {
      "reviewer": {
        "model": "anthropic/claude-sonnet-4",
        "thinking": "high",
        "fallbackModels": ["openai/gpt-5-mini"]
      },
      "worker": {
        "model": "ollama/llama3:8b"
      }
    }
  }
}
```

**Override fields supported:**
| Field | Type | Description |
|-------|------|-------------|
| `model` | `string \| false` | Primary model for agent |
| `fallbackModels` | `string[] \| false` | Backup models for failures |
| `thinking` | `string \| false` | Thinking level (low, medium, high, etc.) |
| `tools` | `string[] \| false` | Tool allowlist |
| `skills` | `string[] \| false` | Injected skills |
| `disabled` | `boolean` | Hide builtin from runtime |
| `systemPromptMode` | `"append" \| "replace"` | How to combine with base prompt |
| `inheritProjectContext` | `boolean` | Keep project instructions |
| `inheritSkills` | `boolean` | Keep skills catalog |

**Project overrides beat user overrides.**

## Architecture

1. **pi-subagents** reads agent definitions from markdown files and settings.json
2. **agentOverrides** in settings modify builtins without file copies
3. **Model resolution**: bare IDs prefer current provider, then registry matches
4. **Fallback system**: ordered backup models for quota/auth/timeout failures

## Start Here

1. **For quick model swap on builtin:** Edit `~/.pi/agent/settings.json` → `subagents.agentOverrides.<name>.model`
2. **For custom agent with specific model:** Create `~/.pi/agent/agents/your-agent.md` with YAML frontmatter
3. **For local model (llama.cpp/Ollama):** Use format `ollama/model-name:size` or `provider/model-id` for any OpenAI-compatible endpoint

## Inline Config Examples

**Slash command with model override:**
```text
/run scout[model=anthropic/claude-haiku-4-5] "analyze auth"
```

**Chain step model:**
```markdown
## planner
model: anthropic/claude-sonnet-4:high
reads: context.md
```

**Runtime tool call:**
```typescript
{ agent: "scout", task: "...", model: "ollama/qwen2.5-coder:7b" }
```