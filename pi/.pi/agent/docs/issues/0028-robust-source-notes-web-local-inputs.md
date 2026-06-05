# Issue 0028: Robust Source Notes for web and local inputs

### Parent

PRD: `docs/prd/0005-pi-native-deep-research.md`

ADR: `docs/adr/0002-pi-native-research-orchestrator.md`

### What to build

Type: AFK.

Build orchestrator-owned Source Note extraction for web sources and supported local inputs. Source Notes should be goal-relevant, citation-numbered, traceable, compact, and safe to cite. Oversized sources should be chunked and merged into a single Source Note when reliable evidence is extracted, while partial extraction failures should be recorded in diagnostics, ledger events, gaps, or Negative Evidence as appropriate.

User stories covered: 25, 26, 27, 54, 55, 58.

### Acceptance criteria

- [ ] Web Source Notes include URL, final URL, title when available, retrieval time, source type, fetched content type, truncation flag, citation number, and evidence snippets
- [ ] Local-file Source Notes include path, retrieval time, source type, citation number, relevant snippets, and content hash
- [ ] Search result snippets and candidate metadata cannot support factual claims unless converted into Source Notes from fetched or read content
- [ ] Raw full source content is excluded from normal artifacts and retained only in Run Diagnostics when needed
- [ ] Oversized sources are chunked and merged into one Source Note with partial extraction markers when applicable
- [ ] If no reliable chunks produce relevant evidence, no Source Note is created and the failure is recorded
- [ ] Tests cover normal, truncated, chunked, partial-failure, and no-reliable-evidence cases

### Blocked by

- Issue 0026 — needs the minimal Research Run loop.
