---
name: to-issues
description: Break a plan, spec, or PRD into independently-grabbable issues on the project issue tracker using tracer-bullet vertical slices. Use when user wants to convert a plan into issues, create implementation tickets, or break down work into issues.
---

# To Issues

Break a plan into independently-grabbable issues using vertical slices (tracer bullets).

## When to use

- You have a plan, spec, or PRD that needs to be broken into implementation issues
- You want independently-grabbable tickets that can be worked on in parallel
- The user wants to hand off implementation work to an issue tracker

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes an issue reference (issue number, URL, or path) as an argument, fetch it from the issue tracker (if available) and read its full body and comments.

### 2. Explore the codebase (if needed)

If you have not already explored the codebase, do so to understand the current state. Use `read`, `grep`, `find`, or read-only `bash` commands — or dispatch a `scout` subagent for broader exploration. Issue titles and descriptions should use the project's domain glossary vocabulary (look for `CONTEXT.md` or `context.md` — case-insensitive), and respect any ADRs in the area you're touching.

### 3. Draft vertical slices

Break the plan into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

Slices may be **HITL** (human-in-the-loop, requiring human interaction such as an architectural decision or design review) or **AFK** (away-from-keyboard, implementable and mergeable without human interaction). Prefer AFK over HITL where possible.

Rules for vertical slices:
- Each slice delivers a narrow but complete path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Type**: HITL or AFK
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories this addresses (if the source material has them)

Ask the user:

- Does the granularity feel right? (too coarse or too fine?)
- Are the dependency relationships correct?
- Should any slices be merged or split further?
- Are the correct slices marked as HITL and AFK?

Iterate until the user approves the breakdown.

### 5. Publish the issues

For each approved slice, publish a new issue to the project's issue tracker if one is configured and accessible. If no issue tracker integration is available, ask the user where to write the issue files.

Apply a `ready-for-agent` triage label if available. Publish issues in dependency order (blockers first) so you can reference real issue identifiers in the "Blocked by" field.

Do not close or modify any parent issue.

## Issue Template

### Parent

A reference to the parent issue on the issue tracker (if the source was an existing issue, otherwise omit this section).

### What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation.

Avoid specific file paths or code snippets — they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it here and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

### Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

### Blocked by

- A reference to the blocking ticket (if any)

Or "None - can start immediately" if no blockers.

## Rules

- Use vertical slices (tracer bullets) — each issue cuts through all layers end-to-end.
- Prefer AFK slices over HITL. Only mark HITL when human interaction is genuinely required.
- Prefer many thin slices over few thick ones.
- Use the project's domain glossary vocabulary from `CONTEXT.md` throughout. Look for both `CONTEXT.md` and `context.md` (case-insensitive) when searching.
- Respect any ADRs in the area you're touching.
- When exploring the codebase, use `read`, `grep`, `find`, or read-only `bash` — or dispatch a `scout` subagent for broader exploration.
- Do not include file paths or code snippets in issue descriptions (except for prototype snippets that encode decisions precisely).
- If no issue tracker integration is available, ask the user where to write the issue files.
- Use `read` over shelling out to `cat` for file contents.
