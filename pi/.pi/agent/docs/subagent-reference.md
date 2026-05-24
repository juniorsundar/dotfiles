# Subagent Reference

This reference holds the longer guidance that used to live in `AGENTS.md`. Keep `AGENTS.md` concise and loaded by default; read this file only when you need examples, fuller routing details, or prompt templates.

## Why This Is Separate

`AGENTS.md` should stay small to avoid recurring context bloat. It still contains the authoritative capability matrix so pi sees the available subagent capacities on every turn.

This file is optional reference material.

## Agent Details

### `local-worker`

Fast local model for cheap, low-context, repetitive, or one-off work.

Best for:

- Repetitive edits.
- Mechanical transformations.
- Simple file summaries.
- Formatting cleanup.
- Renaming within a narrow scope.
- Generating boilerplate.
- Checking simple patterns.
- Extracting TODOs.
- Summarizing small files.
- Inspecting simple command output.
- First-pass grep/recon when scope is small.
- Creating drafts of simple config snippets.

Avoid for architecture, security-sensitive decisions, subtle bugs, broad context, final review of risky changes, unclear requirements, or anything where a wrong answer could cause data loss, broken boot, broken networking, or broken encryption.

### `scout`

Read-only codebase reconnaissance.

Best for finding relevant files, entrypoints, command dispatch, data flow, existing patterns, likely edit points, and risks before planning. Do not use for web research, editing, final review, or architecture decisions.

### `researcher`

Web and documentation research with sources.

Best for official docs, release notes, API behavior, specs, compatibility notes, dependency behavior, recent upstream changes, and security notes. Do not use for local repo inspection or editing.

### `context-builder`

Durable setup pass before planning.

Best for large or unfamiliar codebases, multi-step features, tasks needing preserved context, and preparing handoff material. Avoid for tiny edits and simple bug fixes.

### `planner`

Concrete implementation planning from known context.

Best for sequencing changes, identifying files to edit, defining validation steps, comparing implementation options, and finding decisions needing user approval. Do not use for editing or broad discovery from scratch.

### `worker`

Bounded implementation.

Best for applying approved changes, small-to-medium implementation tasks, scoped refactors, adding tests when scope is known, and running validation. It should escalate unclear decisions instead of guessing.

### `reviewer`

Diff review and small necessary fixes.

Best for checking correctness, task compliance, edge cases, simplicity, regressions, and validation adequacy. Do not use for large implementation or silent rewrites.

### `oracle`

Second opinion before risky action.

Best for challenging assumptions, security-sensitive changes, startup/systemd/networking/storage/encryption decisions, data-affecting changes, or choosing between multiple approaches. Oracle must not edit files.

### `delegate`

Lightweight general-purpose child agent.

Use when no specialized agent fits but a focused side task would reduce main-thread context or risk.

## Example Prompts

### Scout

```text
Goal:
Find where the CLI command dispatch is implemented.

Scope:
Inspect repository structure and likely CLI entrypoints.

Do:
Identify relevant files, entrypoints, and data flow.

Do not:
Edit files or inspect unrelated generated files.

Return:
- Relevant files
- Entry point
- Dispatch flow
- Suggested edit location
- Risks or unknowns
```

### Worker

```text
Goal:
Implement the approved plan.

Scope:
Only edit:
- <file1>
- <file2>

Do:
Apply the planned change, keep the patch minimal, and run relevant checks.

Do not:
Perform unrelated cleanup or make unapproved design decisions.

Edits:
Allowed only within scoped files.

Validation:
<commands/checks>

Return:
- Files changed
- Summary
- Checks run
- Failures or unverified items
- Decisions escalated
```

### Reviewer

```text
Goal:
Review implementation against the original task and plan.

Scope:
Review current diff only.

Do:
Check correctness, edge cases, simplicity, task compliance, and validation.

Do not:
Rewrite unrelated code or expand scope.

Edits:
Small fixes allowed only if clearly required.

Return:
- Review result
- Issues found
- Fixes applied, if any
- Remaining risks
```

### Oracle

```text
Goal:
Challenge the proposed approach before implementation.

Context:
<brief task summary and proposed plan>

Do:
Identify assumptions, risks, safer alternatives, and possible regressions.

Do not:
Edit files or produce a full implementation.

Return:
- Assumptions challenged
- Risks
- Safer alternatives
- Recommended next move
- Confidence level
```
