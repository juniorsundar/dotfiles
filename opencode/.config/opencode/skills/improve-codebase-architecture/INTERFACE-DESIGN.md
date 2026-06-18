# Interface Design

When the user wants to explore alternative interfaces for a chosen deepening candidate, use this parallel design pattern. Based on "Design It Twice" (Ousterhout) — your first idea is unlikely to be the best.

Uses the vocabulary in [LANGUAGE.md](LANGUAGE.md) — **module**, **interface**, **seam**, **adapter**, **leverage**.

## Process

### 1. Frame the problem space

Before generating alternatives, write a user-facing explanation of the problem space for the chosen candidate:

- The constraints any new interface would need to satisfy
- The dependencies it would rely on, and which category they fall into (see [DEEPENING.md](DEEPENING.md))
- A rough illustrative code sketch to ground the constraints — not a proposal, just a way to make the constraints concrete

Show this to the user, then immediately proceed to Step 2. The user reads and thinks while alternatives are generated in parallel when the harness supports it.

### 2. Generate alternative designs

Generate 3+ alternatives in parallel when the harness supports subagents. Each alternative must be a **radically different** interface for the deepened module.

Harness mapping:

- **Pi coding agent**: dispatch multiple `planner` subagents in parallel with edits disallowed. If `planner` is unavailable, use `worker` with a design-only brief. Keep synthesis and recommendation on the main thread.
- **Claude Code**: use parallel `Agent` calls if available.
- **No subagents available**: produce the alternatives yourself, one per constraint below, and keep them clearly separated.

Prompt each helper with a separate technical brief (file paths, coupling details, dependency category from [DEEPENING.md](DEEPENING.md), what sits behind the seam). The brief is independent of the user-facing problem-space explanation in Step 1. Give each helper a different design constraint:

- Helper 1: "Minimize the interface — aim for 1–3 entry points max. Maximise leverage per entry point."
- Helper 2: "Maximise flexibility — support many use cases and extension."
- Helper 3: "Optimise for the most common caller — make the default case trivial."
- Helper 4 (if applicable): "Design around ports & adapters for cross-seam dependencies."

Include both [LANGUAGE.md](LANGUAGE.md) vocabulary and CONTEXT.md vocabulary in the brief so each helper names things consistently with the architecture language and the project's domain language.

Each helper outputs:

1. Interface (types, methods, params — plus invariants, ordering, error modes)
2. Usage example showing how callers use it
3. What the implementation hides behind the seam
4. Dependency strategy and adapters (see [DEEPENING.md](DEEPENING.md))
5. Trade-offs — where leverage is high, where it's thin

### 3. Present and compare

Present designs sequentially so the user can absorb each one, then compare them in prose. Contrast by **depth** (leverage at the interface), **locality** (where change concentrates), and **seam placement**.

After comparing, give your own recommendation: which design you think is strongest and why. If elements from different designs would combine well, propose a hybrid. Be opinionated — the user wants a strong read, not a menu.
