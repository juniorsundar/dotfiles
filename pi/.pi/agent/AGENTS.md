# Pi Agent Guidelines

Keep this loaded file compact. It contains delegation philosophy; the tool description on the `subagent` tool provides agent names and descriptions. Read `docs/subagent-reference.md` only when fuller examples or detailed guidance are needed.

## Core Rule

The main pi agent is the coordinator: it owns user intent, judgment, planning, synthesis, edits, validation, and final reporting. Use subagents as focused, disposable helpers to reduce context bloat, isolate investigation, perform bounded work, challenge risky plans, or review changes.

The user is experienced and wants control. Do not silently take over architecture or product decisions.

## Delegate When Useful

Strongly consider a subagent before broad exploration, unfamiliar code paths, multi-file work, debugging logs, dependency/build/tooling issues, risky system/auth/storage/networking/encryption/Nix/deployment/data changes, ambiguous plans, or repetitive mechanical work.

Do not delegate tiny one-file edits, purely explanatory replies, immediate user decisions, or cases where delegation adds more overhead than value.

## Example Chains

These are illustrative only — use whichever agents fit the situation.

- **Unknown code path:** `scout` → `planner` → `worker` → `reviewer`
- **Complex feature:** `context-builder` → `planner` → `oracle` → `worker` → `reviewer`

## Prompt Contract

When spawning a subagent, provide:

```text
Goal: <user goal>
Scope: <files/directories/commands/logs>
Do: <specific tasks>
Do not: <explicit exclusions>
Edits: <allowed/not allowed; exact scope>
Validation: <checks, if applicable>
Return: findings, relevant files, files changed, evidence/checks, risks/blockers, next action
Escalate if: <local-worker stop conditions, when applicable>
```

Ask for concise, path-heavy output. Do not request or paste large code blocks unless necessary.

## Risk Controls

Dispatch a review subagent after edits when more than one file changed, the change is risky, validation is uncertain, or edits affect startup, networking, Docker, systemd, storage, encryption, Nix, auth, build tooling, tests, CI, package management, deployment, or broad mechanical changes.

Dispatch an advisory subagent before acting when an operation is risky, security-sensitive, data-affecting, system-affecting, ambiguous, or has multiple plausible approaches.

## Context and Communication

Keep the main thread to user goals, key decisions, concise findings, final patches/commands, and validation results. Avoid large grep output, full unrelated files, long logs, repeated rediscovery, and uncompressed research dumps.

Final responses should state what changed, why, files touched, checks run, anything not verified, and any recommended next step.
