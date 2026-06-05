# Issue 0021: Bootstrap Research Orchestrator extension

### Parent

PRD: `docs/prd/0005-pi-native-deep-research.md`

ADR: `docs/adr/0002-pi-native-research-orchestrator.md`

### What to build

Type: AFK.

Create the first end-to-end skeleton of the pi-native Research Orchestrator. It should register the human command surface and the high-level `deepresearch` agent tool, establish the Workspace Research Store, expose basic status output, and provide tested seams for model setup, artifact storage, budget accounting, source access, and rendering. This slice should not run research yet; it creates the stable extension frame that later tracer bullets can extend.

User stories covered: 14, 15, 39, 54, 56, 57, 60.

### Acceptance criteria

- [ ] The Research Orchestrator extension registers a human research command and a high-level `deepresearch` agent tool
- [ ] The command and tool can report that no Research Runs or Research Proposals exist in a fresh workspace
- [ ] The Workspace Research Store is initialized under the active Pi session workspace, not the global Pi agent directory
- [ ] The extension exposes tested seams for model setup, run storage, budgets, source access, and renderers
- [ ] The one-active-run v1 constraint is represented in the lifecycle skeleton even before execution exists
- [ ] Unit tests verify registration, workspace scoping, and empty status behavior

### Blocked by

- Issue 0020 — needs the Research Brain setup policy.
