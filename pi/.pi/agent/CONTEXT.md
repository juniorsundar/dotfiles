# Pi Agent Research

This context describes the language for pi-native deep research workflows that gather varied information for a bounded question and synthesize an answer for the coding agent or user.

## Language

**Research Run**:
A bounded investigation for one research question. A **Research Run** preserves its question, gathered sources, evidence, intermediate findings, unresolved gaps, and final synthesis so it can survive interruption or context loss; its directory uses a date, human-readable slug, and short ID.
_Avoid_: Research project, knowledge base, conversation

**Research Question**:
The specific question a **Research Run** is trying to answer. It should be narrow enough to synthesize into a useful brief, even when the answer draws from varied sources.
_Avoid_: Topic, project, prompt

**Research Brief**:
The synthesized answer produced by a **Research Run**, written for both the user and the coding agent. A **Research Brief** supports decisions by presenting the bottom line, evidence, interpretation, tradeoffs, caveats, numbered citations with linked source references, and a low/medium/high confidence level with rationale; it includes implications for Pi or the current task only when the run was agent-triggered or task-triggered. The **Research Orchestrator** validates that citations reference existing **Source Notes** and repairs or fails unrecoverable invalid citations rather than silently accepting them.
_Avoid_: Final answer, agent-only report, raw summary, numeric certainty score, invented citations

**Research Proposal**:
A file-backed request to start a **Research Run**. A **Research Proposal** presents the **Research Question**, proposal summary, purpose, evidence mix, budget, blocking/background mode, trigger, and optional Research Brain model override so the user can edit all core fields in `proposal.md`, approve, or deny the run. The `proposal.md` file is the source of truth at approval time; approval re-reads and validates the file before a run can start. Unapproved proposals live as lightweight artifacts in the **Workspace Research Store** and do not become **Research Runs** until approved. Proposal generation happens before approval and cannot consume an approved **Research Budget**. Agent-triggered use creates proposals only, and user approval starts the run.
_Avoid_: Brief, final answer, task prompt, silent start

**Proposal Summary**:
The short pre-run explanation of what the proposed **Research Run** will investigate. It is distinct from the **Research Brief**, which is produced after research completes.
_Avoid_: Brief, research brief, final output

**Research Budget**:
The explicit hard limit approved with a **Research Proposal**, such as maximum searches, fetch attempts, source visits, synthesis rounds, wall-clock time, or model calls. One URL or local file counts as one successful source visit even if chunked, while failed fetches consume fetch-attempt budget but not successful source-visit budget; chunk extraction still consumes model-call or round budget as applicable. Readiness checks are setup validation, accounted separately in **Workspace Diagnostics** or **Run Diagnostics**, and do not consume the approved **Research Budget**. The **Research Brain** may recommend stopping early, but the **Research Orchestrator** enforces the **Research Budget** and accepts early stopping only when minimum evidence requirements are satisfied or missing categories are supported by recorded **Negative Evidence**. When exhausted, the **Research Run** produces a best-effort **Research Brief** with caveats and may recommend a continuation.
_Avoid_: Unlimited research, open-ended investigation

**Continuation Recommendation**:
A note in a **Research Brief** that names the remaining gaps and proposes an additional **Research Budget** if more investigation is worthwhile. A budget-exhausted **Research Run** is terminal for the approved budget allocation but may continue only through explicit user-approved continuation that preserves prior artifacts and records the budget revision.
_Avoid_: Silent retry, automatic extension

**Evidence Mix**:
The intended spread of source categories for a **Research Run**, such as official documentation, source code, changelogs, benchmarks, issue discussions, user reports, competing implementations, or recent articles. A **Research Proposal** may name minimum evidence requirements within the **Evidence Mix**, and a **Research Brief** should state which parts of the **Evidence Mix** were found, weak, or missing.
_Avoid_: Source list, random search results

**Source Note**:
An extracted, goal-relevant note from a source read during a **Research Run**. A **Source Note** records traceability metadata such as URL or local file path, final URL for fetched web sources, title when available, retrieval time, source type, fetched content type, truncation flag, citation number, and evidence snippets, but does not store the full raw source by default; oversized sources are chunked and merged into one source note when needed. For local files, the **Source Note** also records a content hash so later file changes are detectable. Raw fetched content may be retained only in **Run Diagnostics** when needed. Search result snippets and candidate metadata guide selection and Negative Evidence, but do not support factual claims in a **Research Brief** unless converted into a **Source Note** from fetched or read content. Truncated fetched content can support claims only about the retrieved portion; if truncation may affect the **Research Question**, the run should fetch or chunk more within budget or record a gap. If chunk extraction partially fails, the merged **Source Note** must mark partial extraction; if no reliable chunks produce relevant evidence, no **Source Note** is created and the extraction failure is recorded instead.
_Avoid_: Raw source dump, page snapshot, citation-only entry, search-snippet citation

**Progress Digest**:
A compact user-facing status update emitted by a **Research Run** while it is in progress. A **Progress Digest** shows budget usage, evidence mix coverage, current signal, gaps, next step, and artifact paths without streaming every intermediate observation into the main conversation.
_Avoid_: Full stream, raw log, hidden progress, model working memory

**Steering Instruction**:
A user-provided adjustment to an active **Research Run**, such as prioritizing a source type, excluding a source class, adding a constraint, or requesting synthesis after the current step. V1 steering is limited to cancellation, forced synthesis, and adding an instruction. Added instructions may narrow, prioritize, exclude, or clarify within the approved **Research Question**, but may not broaden scope, add a substantially new comparison axis, or require a new **Evidence Mix** without explicit continuation or a new **Research Proposal**.
_Avoid_: Parallel chat, unlimited replanning, scope expansion

**Research Trigger**:
An external, decision-relevant uncertainty that justifies proposing a **Research Run**. Common **Research Triggers** include technology feasibility, library or provider comparisons, current API behavior, benchmarks, pricing, recent changes, and alternatives for an architectural choice. Agent-triggered research requires a valid **Research Trigger** and should refuse routine lookup or curiosity-only requests; human-initiated research may warn on weak triggers but can proceed after explicit confirmation.
_Avoid_: Local codebase exploration, routine lookup, curiosity-only search

**Blocking Research Run**:
A **Research Run** whose answer is needed before the current design or grilling conversation can responsibly continue. A **Blocking Research Run** pauses the current decision path until its **Research Brief** is available.
_Avoid_: Background lookup, optional evidence

**Background Research Run**:
A **Research Run** that can proceed while the main conversation continues. In v1, a **Background Research Run** is an in-process asynchronous run owned by the current Pi session, not a detached process. V1 permits only one active **Research Run** per Pi session/workspace; additional approved runs are queued or require user action. It surfaces **Progress Digests** and its **Research Brief** without blocking non-dependent discussion; on Pi shutdown, active runs stop, are marked interrupted, and may be manually resumed from artifacts later. If in-process concurrency is unavailable, v1 should degrade to explicit polling or step execution rather than detached execution.
_Avoid_: Decision blocker, hidden async task, detached orphan process

**Manual Resume**:
A user-approved continuation of an interrupted, readiness-failed, or budget-exhausted **Research Run** using its existing artifacts, source notes, ledger, and budget usage when present. **Manual Resume** presents the previous state and asks the user to approve the remaining or revised **Research Budget** before continuing; for readiness-failed runs, it presents diagnostics and reruns readiness after approval before any source work begins. Completed **Research Runs** are terminal in v1 and require a new **Research Proposal** for new facts or angles.
_Avoid_: Automatic restart, hidden continuation, reopening completed research

**Workspace Research Store**:
The workspace-local `.pi/research/` directory where **Research Run** artifacts are stored by default. It belongs to the current working directory for the active Pi session, such as the project or invocation workspace, not the global pi agent directory.
_Avoid_: Global research cache, home directory store

**Promoted Research Brief**:
A **Research Brief** copied or transformed from the **Workspace Research Store** into project-shareable documentation, such as `docs/research/` or an ADR-supporting note. Promotion creates a shareable package that includes the brief plus enough citation metadata and evidence snippets to audit claims without relying on local `.pi/research` paths. Budget-exhausted briefs may be promoted only with their best-effort status, caveats, gaps, confidence rationale, and continuation recommendation preserved. Research artifacts are local scratch by default and become shared documentation only through explicit promotion.
_Avoid_: Auto-committed research, hidden project documentation, raw diagnostics promotion

**Research Orchestrator**:
The pi extension component that owns **Research Proposal** approval, **Research Run** lifecycle, artifacts, progress digests, budgets, source access, deterministic analysis helpers, and final brief creation. The **Research Brain** proposes structured research intents, but the **Research Orchestrator** validates those intents and performs side-effecting operations such as search, fetch, local reads, artifact writes, budget accounting, and progress reporting. V1 exposes a `/research` command for human use and one high-level `deepresearch` tool for agent use; subagents may participate in later versions as delegated step workers.
_Avoid_: Subagent wrapper, raw model proxy, many low-level tools

**Research Brain**:
The model responsible for deciding research direction within a **Research Run**, including query planning, source prioritization, Source Note extraction when invoked by the **Research Orchestrator**, finding synthesis, and deciding whether to continue or produce a **Research Brief**. The **Research Brain** does not receive direct tool access in v1; it proposes a limited set of structured intents, and the **Research Orchestrator** decides whether and how to execute them. V1 intents are search, select sources, update findings, synthesize brief, and stop early. Source Note extraction is a required orchestrator phase after a selected source is read, not an optional Brain-directed action. V1 uses Tongyi DeepResearch as a single **Research Brain**, while the **Research Orchestrator** provides budgets, persistence, execution, and guardrails.
_Avoid_: Generic model, raw responder, subagent, tool-using agent, arbitrary action protocol

**Model Readiness Check**:
A required validation that the **Research Brain** is reachable and behaves well enough for a **Research Run**. V1 performs a quick reachability check before showing or creating a normal approvable **Research Proposal**, then a full operational check after approval and before starting; the full check verifies basic completion, stop-token behavior, structured-output recoverability, and evidence-grounded synthesis. Failure hard-blocks **Research Runs** in v1, and `/research doctor` runs the check on demand with diagnostic setup hints.
_Avoid_: Assume model works, best-effort startup, override failed validation

**Inline Thinking**:
Text emitted by a **Research Brain** inside tags such as `<think>...</think>`. **Inline Thinking** is excluded from normal **Research Run** artifacts; raw model responses may be retained only in **Workspace Diagnostics** or **Run Diagnostics**.
_Avoid_: Research evidence, source note, final brief content

**Workspace Diagnostics**:
Local troubleshooting artifacts stored under `.pi/research/diagnostics/` before a **Research Run** exists, such as quick reachability failures and `/research doctor` results. **Workspace Diagnostics** are not **Research Proposals** or **Research Runs** and are not promoted into project documentation.
_Avoid_: Proposal, run artifact, shared documentation

**Run Diagnostics**:
Local troubleshooting artifacts stored under a **Research Run** directory, such as full readiness-check results, raw model responses, parser failures, and timing data. **Run Diagnostics** are separate from normal research artifacts and are not promoted into project documentation.
_Avoid_: Source notes, research brief, shared documentation

**Human Research View**:
An optional self-contained `index.html` rendering of a **Research Run** for human reading, derived from canonical Markdown and JSON artifacts. The **Research Brief** provides the main content, while status, budget, evidence mix, Source Note metadata, and brief-version metadata drive labels, warnings, source links, budget and coverage summaries, and stale or best-effort banners. A **Human Research View** is auto-generated for human-initiated runs and available on demand for agent-triggered runs; Pi prints the HTML path rather than opening it automatically.
_Avoid_: Canonical artifact, replacement for markdown brief, auto-opened browser, external asset bundle

**Web Research Access**:
The search and fetch capability used by the **Research Orchestrator** to gather external sources. V1 should use Pi-style web search and fetch behavior plus local text, Markdown, and source-file inputs without requiring new paid external APIs; provider plugins and document parsers can be added later if needed. Local files are supporting inputs only when the primary trigger is external decision uncertainty, and local-source notes are cited separately from web sources.
_Avoid_: Mandatory paid search API, browser automation by default, full document parsing in v1, local-codebase-only run

**Candidate Filtering**:
Deterministic cleanup applied to search results before the **Research Brain** chooses sources to read. **Candidate Filtering** deduplicates URLs, annotates metadata, applies coarse ranking rules such as preferring primary and official sources, downranks low-signal or SEO-heavy pages, and preserves enough metadata for traceability. In v1 it may drop exact or near duplicates, inaccessible or invalid URLs, obvious spam or SEO farms, and sources excluded by proposal or steering; otherwise it prefers downranking over dropping. Dropped candidates are recorded with reasons when material to coverage. The **Research Brain** selects among filtered candidates with reasons and does not receive the raw unfiltered search dump in v1.
_Avoid_: Raw search dump, model-only source selection

**Negative Evidence**:
Failed searches, missing source categories, dropped sources, contradictions, unsupported claims, or user-excluded source categories discovered during a **Research Run**. **Negative Evidence** is recorded in the ledger and reflected in gaps or confidence rationale without overwhelming the **Research Brief**. The **Research Brief** distinguishes source categories that were not found, not searched due to budget, or excluded by proposal or steering instruction.
_Avoid_: Silent omission, repeated dead end

**Claim/Evidence Ledger**:
The append-only `ledger.jsonl` record of claims, supporting evidence, contradictions, dropped sources, source selection decisions, gaps, budget approvals or revisions, steering instructions, and synthesis decisions discovered during a **Research Run**. The **Claim/Evidence Ledger** remains lightweight and file-based, not a database.
_Avoid_: Hidden memory, complex knowledge graph

**Run Summary**:
A compact model-facing `run-summary.md` working-memory artifact refreshed between rounds of a **Research Run**. The **Run Summary** carries forward the research question, budget remaining, evidence mix status, supported claims, contradictions, recent source notes, stable Source Note IDs, citation numbers, and unresolved gaps without reloading the entire ledger into the **Research Brain**. It may share source data with the **Progress Digest** but is not optimized for human display; final citation formatting and linking remain orchestrator-owned.
_Avoid_: Full ledger replay, hidden context, final brief, user progress display

**Deterministic Analysis Helper**:
Extension-owned code that performs fixed, predictable analysis during a **Research Run**, such as counting, deduplication, simple table processing, or citation linking. V1 allows **Deterministic Analysis Helpers** but forbids runtime-generated code execution by the **Research Brain**.
_Avoid_: Model-written Python, arbitrary code execution, sandbox bypass

## Flagged ambiguities

None currently.

## Example dialogue

> **Dev**: I need to decide whether a pi extension should orchestrate Tongyi DeepResearch directly or use pi-native tools.
>
> **Domain Expert**: Start a Research Run with that Research Question. The run gathers varied sources, records evidence and gaps, then produces a Research Brief that the coding agent can use when making the architectural decision.
