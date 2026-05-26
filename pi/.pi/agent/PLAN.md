# Plan Mode Redesign

## Core Philosophy
Planning should be **question-first, then structured, then reviewed**. No implementation until every ambiguity is resolved and the user has approved a phased plan.

## Flow

### 1. Scoping (Plan Mode)
Agent investigates codebase and asks **exhaustive** clarifying questions using `ask_user_question`. Questions cover:
- Scope boundaries (what's in/out)
- Edge cases and error handling preferences
- Style/pattern preferences
- Priority and ordering
- Performance constraints
- Existing patterns to follow

The agent must ask at least one round of questions before drafting a plan. It saves progress to PLAN.md with `> Status: scoping`.

### 2. Drafting (Plan Mode)
Once all questions are resolved, the agent writes a structured phased plan to PLAN.md with `> Status: ready`.

### 3. Approval (Plan Mode)
User reviews the plan. Options:
- Approve and execute
- Refine the plan
- Exit

### 4. Execution (Execution Mode)
Agent executes phase by phase. After each step: `[DONE:x.y]` markers. After all steps in a phase, the extension detects phase completion and injects a review request.

### 5. Phase Review
After a phase completes, the extension sends a message asking the agent to verify the phase's review criteria. The agent checks the work (reading files, running tests) and then proceeds only after confirmation. This is not a subagent call — it's the main agent reviewing its own work against stated criteria, then pausing for user approval.

## PLAN.md Format

```markdown
# Plan: [Title]

> Status: scoping

## Decisions
- **Scope**: [what's included/excluded]
- **Approach**: [chosen approach and why]

## Phase 1: [Name] → `path/to/file1.ts`, `path/to/file2.ts`
- [1.1] Step description
- [1.2] Step description
🔍 **Review**: [specific criteria to verify]

## Phase 2: [Name] → `path/to/file3.ts`
- [2.1] Step description
🔍 **Review**: [specific criteria to verify]

## Phase N: Integration & Verification → `path/to/test.ts`
- [N.1] Final integration
🔍 **Review**: Run full test suite, verify all requirements met
```

## Tracking

- **Step completion**: `[DONE:x.y]` markers in assistant responses
- **Phase completion**: `[PHASE_DONE:x]` after all steps in a phase are done and review verified
- **Status bar**: Shows `📋 Phase 2/5 · Step 2.3` during execution
- **Stage detection**: Extension reads PLAN.md status line to determine current stage
- **State persistence**: State saved to session entries, PLAN.md is source of truth

## Key Improvements Over Current Design

1. **Question-first scoping** — system prompt forces at least one round of questions before any plan drafting
2. **Decision log** — not just Q&A but documented scope/approach decisions persisted in PLAN.md
3. **Location annotations** — each phase explicitly names affected files
4. **Review criteria** — each phase has explicit criteria, not just "review"
5. **Phase-by-phase execution** — with automatic pause-and-verify between phases
6. **Stage-aware UI** — different options shown based on whether we're scoping, have a draft, or are executing
7. **Subagent review** — after each phase, agent dispatches a reviewer subagent to validate the phase's review criteria
