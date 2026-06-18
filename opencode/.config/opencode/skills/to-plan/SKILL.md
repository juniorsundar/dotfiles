---
name: to-plan
description: Turn the current conversation context into a concrete implementation plan for immediate execution. Use when the user wants to plan quick implementation after a grilling session, or when saying "let's plan this" or "make a plan" for a change that doesn't need a full PRD.
---

# To Plan

Turn conversation context into a concrete, ordered implementation plan — persisted as a file that tracks progress so you can resume across sessions.

## When to use

- You've just finished a `grill-with-docs` session and want to move straight to building
- The change is small-to-medium and doesn't warrant a full PRD → issues → TDD pipeline
- The user says "let's plan this" or "make a plan" and intends to implement right away

## When NOT to use

- The change is large enough to need formal handoff → use `to-prd` instead
- The user wants to break work into separately-grabbable tickets → use `to-issues` instead
- The conversation has no design context yet → `grill-with-docs` first, then `to-plan`

## Process

### 1. Gather what you already know

Work from whatever is already in the conversation context — decisions from grilling, terminology from `CONTEXT.md`, ADRs, codebase exploration you've already done. Do not interview the user.

If you haven't explored the codebase yet, do so now. Use `read`, `grep`, `find`, or read-only `bash` commands — or dispatch a subagent for broader exploration. Read the project's domain glossary (look for `CONTEXT.md` or `context.md` — case-insensitive) and respect any ADRs in the area you're touching.

### 2. Identify scope boundaries

Decide — and propose — what is in scope and out of scope for this plan. Be explicit about what you're excluding. The user can adjust.

### 3. Draft the plan

Write the plan as numbered **slices**, ordered by dependency. Each slice is a vertical cut through all relevant layers — not a horizontal task list. Use the project's domain glossary vocabulary from `CONTEXT.md` throughout.

Each slice should specify:

- **What**: one behaviour or capability this slice delivers
- **Test**: what test confirms it works (behaviour-level, not implementation)
- **Touches**: which modules/files this slice modifies (approximate, not exhaustive)
- **Depends on**: which earlier slices (if any)

The first slice should be a **tracer bullet** — the thinnest end-to-end path that proves the approach works.

End the plan with:

- **In scope**: what this plan covers
- **Out of scope**: what it deliberately doesn't
- **Open questions**: anything you're unsure about that the user should decide

### 4. Review with the user

Present the plan. Ask:

- Does the scope feel right? (Anything missing or over-scoped?)
- Is the slice order correct? (Any dependency issues?)
- Are the open questions answerable now, or should they be resolved during implementation?

Iterate until the user approves the plan.

### 5. Write the plan file

Once approved, write the plan to `plan-<slug>.md` at the project root. Use a short kebab-case slug derived from the goal — e.g. `plan-add-bcrypt-hashing.md`. If the plan is the main or only plan in progress, `plan.md` is fine too.

If a plan file with the same slug already exists, read it first — it may contain progress from a previous session. Merge any new decisions rather than overwriting. See [Plan format](#plan-format) for the structure including progress tracking.

### 6. Execute

Start implementing the first incomplete slice. If the user wants TDD, switch to the `tdd` skill now. Otherwise, implement slices in order, running tests after each one.

**After completing each slice**, update the plan file — mark the slice status as `done` and add a brief note of what was implemented. This ensures the plan is a reliable resume point if the session closes.

### 7. Resume

If a `plan-<slug>.md` already exists when the user says "continue the plan" or "pick up where we left off":

1. Read the plan file to see which slices are done, in-progress, or pending.
2. Summarise progress to the user: what's done, what's next.
3. Continue from the first incomplete slice.

If the context from the original session is lost, the plan file plus `CONTEXT.md` and any ADRs should give enough context to resume.

## Plan format

Each slice has a **status** field that tracks progress. Update the file after completing each slice.

```markdown
# Plan: <short title>

## Goal
[One sentence describing what we're building and why]

## Slices

1. **[Slice name]** — ✅ done
   - What: [behaviour this delivers]
   - Test: [how to confirm it works]
   - Touches: [approximate module/file areas]
   - Depends on: none / #N
   - Notes: [brief note on what was implemented, added after completion]

2. **[Slice name]** — 🔄 in progress
   - ...

3. **[Slice name]** — ⏳ pending
   - ...

## Scope
- In scope: [list]
- Out of scope: [list]

## Open questions
- [list, or "None — ready to go"]
```

Status markers:
- ⏳ pending — not started
- 🔄 in progress — currently being worked on
- ✅ done — completed, with a notes line summarising what was done

## Rules

- Synthesize from existing context. Do not interview the user — use what you already know.
- Use vertical slices ordered by dependency — each slice is a thin, complete path through all layers.
- The first slice is always a tracer bullet (thinnest end-to-end proof of concept).
- Use the project's domain glossary vocabulary from `CONTEXT.md` throughout. Look for both `CONTEXT.md` and `context.md` (case-insensitive) when searching.
- Respect any ADRs in the area you're touching.
- Persist the plan as `plan-<slug>.md` at the project root. Update it after completing each slice.
- If resuming, read the existing plan file first — it contains progress from the previous session.
- Do not include specific file paths or code snippets in the plan (they go stale fast). Exception: a notes line on a completed slice may mention key files that were created/modified.
- When exploring the codebase, use `read`, `grep`, `find`, or read-only `bash` — or dispatch a subagent for broader exploration. Use `read` over shelling out to `cat` for file contents.
