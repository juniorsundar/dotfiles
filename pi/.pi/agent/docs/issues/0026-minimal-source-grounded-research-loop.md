# Issue 0026: Minimal source-grounded Research Run loop

### Parent

PRD: `docs/prd/0005-pi-native-deep-research.md`

ADR: `docs/adr/0002-pi-native-research-orchestrator.md`

### What to build

Type: AFK.

Implement the thinnest complete Research Run loop: the Research Brain proposes structured intents, the Research Orchestrator validates and executes side-effecting operations, source access gathers evidence, Source Notes and ledger entries are written, the Run Summary is refreshed, and the run can synthesize a small Research Brief. This is the first demoable end-to-end research path, intentionally narrow but source-grounded.

User stories covered: 18, 19, 20, 23, 25, 38, 50, 51, 52, 53, 54.

### Acceptance criteria

- [ ] The Research Brain proposes only the v1 structured intents accepted by the Research Orchestrator
- [ ] Search, fetch, local reads, artifact writes, budget accounting, and progress reporting are performed by the orchestrator, not directly by the Research Brain
- [ ] A minimal Research Run can gather at least one source, create at least one Source Note, append ledger entries, refresh a Run Summary, and synthesize a draft Research Brief
- [ ] The run loop respects approved budget limits for searches, fetch attempts, source visits, model calls or rounds, and elapsed time
- [ ] The Research Brain can recommend early synthesis, and the orchestrator accepts it only when minimum evidence requirements or recorded Negative Evidence allow it
- [ ] Integration tests cover a mocked end-to-end run from approved proposal through brief creation

### Blocked by

- Issue 0025 — needs approved Research Runs.
