---
name: grill-with-docs
description: Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation (CONTEXT.md, ADRs) inline as decisions crystallise. Use when user wants to stress-test a plan against their project's language and documented decisions.
---

# Grill With Docs

Use this skill when you want to stress-test a plan against your project's language and documented decisions. It challenges the plan against the existing domain model, sharpens terminology, and updates documentation (`CONTEXT.md`, `ADRs`) inline as decisions crystallise.

## When to use

- You have a plan or design you want to rigorously interrogate before committing to it
- You want terminology and domain concepts to align with your project's existing glossary
- You want `CONTEXT.md` and architecture decision records kept in sync with decisions as they emerge

## How to grill

Interview the user about every aspect of the plan until you reach shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one by one.

1. **Ask one question at a time**, waiting for feedback on each before continuing.
2. **Provide your recommended answer** with each question.
3. **Use codebase evidence** when a question can be answered by inspecting existing code or documentation. Use `read`, `grep`, `find`, or read-only `bash` commands — or dispatch a `scout` subagent for broader exploration.
4. **Stay on the main thread** for the interview itself. Subagents (`scout`) are for gathering codebase evidence only; never delegate the grilling dialogue.
5. Optionally, dispatch an `oracle` subagent to challenge particularly risky architectural decisions before finalising them.

## Domain awareness

During codebase exploration, look for existing documentation:

### File structure

Most repos have a single context:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/adr/
```

Create files lazily — only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md` right there. Don't batch these up — capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

`CONTEXT.md` should be totally devoid of implementation details. Do not treat `CONTEXT.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).

## Rules

- Ask one question at a time. Wait for the user's response before continuing.
- Always provide your recommended answer with each question.
- `CONTEXT.md` is a glossary, not a spec, scratch pad, or repository for implementation decisions.
- Only offer ADRs when all three criteria are met (hard to reverse, surprising without context, real trade-off).
- When in doubt about codebase state, use `read`, `grep`, `find`, or read-only `bash` commands — or dispatch a `scout` subagent for broader exploration.
- Never delegate the interview dialogue to a subagent.
- Use `read` over shelling out to `cat` for file contents.
