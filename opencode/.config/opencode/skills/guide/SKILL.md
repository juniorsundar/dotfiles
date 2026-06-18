---
name: guide
description: Walk a human developer through implementing a plan or issue step by step, with active verification after each step. Use when the user wants to be guided through implementation instead of having the agent do it, or says "guide me", "walk me through", or "help me implement this myself".
---

# Guide

Walk a human developer through implementation. The agent instructs — the human writes the code.

## When to use

- The user has a plan or issue and wants to implement it themselves with expert guidance
- The user says "guide me through this", "walk me through", or "help me implement this myself"
- The user wants to learn by doing rather than watching an agent work

## When NOT to use

- The user wants the agent to implement directly → use `tdd` or normal agent workflow
- The user wants to stress-test a design → use `grill-with-docs`
- The user wants to create a plan or issues → use `to-plan` or `to-issues`

## Process

### 1. Load the target

Determine what the user is guiding through:

- **Issue file** — read the issue (e.g. `docs/issues/0003-add-auth.md`)
- **Plan file** — read the plan (e.g. `plan-add-auth.md`)
- **Freeform goal** — infer the goal from conversation context; produce an implicit plan during Orient

If the target is a plan with multiple slices, guide through the **first incomplete slice only**. Suggest re-invoking `/guide` for subsequent slices.

### 2. Orient

Present a high-level summary and step breakdown. Wait for acknowledgment before proceeding.

- **Structured targets** (issue, plan): use the target's structure as a skeleton, decomposing steps that are too large for a human to do in one go. "Add auth middleware" becomes: create file → write interface → add route hook → write test.
- **Freeform targets**: produce a step breakdown implicitly (like `to-plan` would) so the user can course-correct before any code is written.

### 3. Step loop

For each step, present: **What** (concrete action), **Why** (connects to target purpose), **Watch out for** (pitfalls), **Done when** (verification criteria). Then **wait for the user to say they're done**.

### 4. Verify

Actively verify the user's work:
- **Structural** (default): file exists, correct signature, imports present
- **Behavioral** (critical steps only): read the code, reason about correctness, suggest running tests

If something is wrong:
- **Small errors** → diagnostic hint ("Check the return type — this function is async")
- **Conceptual misunderstandings** → Socratic question ("What happens if the token is expired?")

If stuck, escalate: stronger hint → partial snippet → full snippet. Last resort: offer to implement the step ("say 'you do it'").

### 5. Advance

Move to the next step. If the user goes off-plan, **pause** — note where you are, acknowledge the detour, and wait.

### 6. Wrap up

Summarize what was accomplished. Note anything left undone. For multi-slice plans, suggest `/guide <target>` for the next slice.

## Resuming

Stateless. On re-invocation, read the target and inspect the codebase to determine what's done. Skip completed steps. If ambiguous, present the step list and ask the user where they left off.

## TDD awareness

When the target has test criteria, naturally instruct "write the test first, then implement." Don't enforce full red-green-refactor, but respect the discipline for testable behaviors. Don't force TDD for steps that don't need it (config, docs).

## Rules

- The human writes the code. The agent instructs, verifies, and corrects — never implements (unless the user explicitly says "you do it").
- One target per session. For multi-slice plans, guide one slice and suggest re-invoking.
- The target is read-only. Do not modify issue files, plan files, or status markers.
- Use the project's domain glossary from `CONTEXT.md` throughout. Look for both `CONTEXT.md` and `context.md` (case-insensitive).
- Respect any ADRs in the area you're touching.
- When exploring the codebase, use `read`, `grep`, `find`, or read-only `bash` — or dispatch a subagent for broader exploration. Use `read` over shelling out to `cat`.
- Verification is structural by default, behavioral for critical steps.
- Handle mistakes with diagnostic hints (small errors) or Socratic questions (conceptual misunderstandings).
- If the user is stuck, escalate progressively. Offer to implement the step as an escape hatch.
- If the user goes off-plan, pause — don't interrupt or silently adapt.
