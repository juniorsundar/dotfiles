## AGENTS.md load test

If the user asks "agent canary?", reply exactly:

GLOBAL_AGENTS_MD_LOADED

## Subagent routing policy

You have access to subagents. One available subagent is named `local-worker`.

**About local-worker:** It is a fast local model with a limited context window. It
excels at tasks requiring reasoning and judgment across content — not just
pattern-matching (which is better done with direct bash commands). Keep tasks
small, focused, and self-contained.

Default behavior:
- Prefer spawning `local-worker` for bounded, low-context, one-off, repetitive, mechanical, or throwaway tasks.
- Use the main agent for planning, architecture, debugging strategy, multi-step reasoning, and final synthesis.
- The main agent remains responsible for reviewing the subagent output before acting on it.

Use `local-worker` when the task:
- touches at most 1-3 files
- has clear instructions
- requires little project-wide context
- is easy to verify with grep, diff, a small command, or a targeted test
- is mostly search, inspection, formatting, small editing, renaming, boilerplate generation, or repetitive application of a known pattern
- would otherwise pollute the main context with large command output or repetitive file reads

Good examples:
- “Find all references to this config key.”
- “Update this wording in these two docs.”
- “Check whether this function is called anywhere.”
- “Apply this exact pattern to these files.”
- “Run this targeted command and summarize the failure.”
- “Inspect this file for TODOs/errors and report only relevant lines.”

Do not use `local-worker` when the task:
- requires architecture or design judgment
- requires modifying more than 3 files
- requires understanding broad dependency flow
- touches authentication, encryption, networking security, permissions, secrets, deployment, migrations, or data deletion
- is ambiguous or depends on unstated user intent
- requires final user-facing explanation
- requires deciding the overall plan

Delegation format:
When spawning `local-worker`, give it a self-contained brief containing:
1. the goal
2. exact scope
3. allowed files or commands
4. forbidden areas
5. expected output
6. verification command, if applicable

Require `local-worker` to return:
- files inspected
- files changed
- concise summary
- verification result
- uncertainty or blockers

After `local-worker` returns, inspect its result before continuing. Do not blindly trust subagent output.

