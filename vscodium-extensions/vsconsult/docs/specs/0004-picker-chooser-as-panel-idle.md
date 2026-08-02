# Picker chooser as the Panel's idle state

## Problem Statement

vsconsult's bottom Panel hosts a single shared webview view that serves whichever picker was invoked by a command — `vsconsult.findFile` for the file picker, `vsconsult.liveGrep` for the grep picker. But the Panel can be visible with *no* picker running: when the user clicks the vsconsult Panel tab from elsewhere without invoking a command, or when a picker exits while the Panel stays pinned. In those moments the Panel shows empty chrome — the static webview HTML with no configured picker, no candidates, and stale or absent labels. There is no entry point that tells the user *which pickers vsconsult offers* or lets them choose one without remembering and binding a separate command per picker. The Panel's idle state is a dead end instead of a home screen.

The architecture already anticipates uniformity: ADR-0002 declared one shared view serving any registered picker, and ADR-0006 (recorded alongside this spec) decided the Panel's idle state should itself be a registered picker — the **picker chooser** — reached through an injected `defaultPickerId` so the host stays picker-agnostic. This spec implements that decision.

The user wants the Panel's idle state to be a menu of the available pickers: open the Panel fresh, or return to it after a pinned picker exits, and land on a list you can narrow and accept to start the chosen picker — never on blank chrome.

## Solution

Add the picker chooser as a new registered picker type (id `"pick"`, label "Pick") configuring the existing five parts (Source / Candidate / Narrowing / Render / Accept+Preview). It is the Panel's idle state: shown whenever the Panel is visible and no session is active, reached through a `defaultPickerId` the extension wires to `"pick"` at activation (the host never names a picker). The chooser is a snapshot, query-agnostic source that enumerates the registry minus itself, sorted alphabetically by label; narrowing reuses the shared fuzzy primitive; render shows the picker label as primary and its placeholder as secondary; preview is a no-op; accept starts the chosen picker through a new `startPicker` picker-context primitive. A `vsconsult.pickPicker` command invokes it directly, uniform with the other pickers.

Open the Panel (or return to it after an exit) → the chooser is already showing File and Grep; arrow to Grep, Enter → the grep picker starts; Escape back to the chooser; type `fi` → fuzzy-narrows to File; Enter → file picker starts. No new view, view-container, or view declaration; the shared view serves the chooser as it does every picker.

## User Stories

1. As a vsconsult user, I want the Panel to show a list of available pickers when I open it without invoking a specific picker command, so that I don't face an empty Panel with no indication of what's on offer.
2. As a vsconsult user, I want to narrow the list of pickers by typing, so that I can jump to the one I want by a few characters.
3. As a vsconsult user, I want fuzzy matching on picker labels (e.g. typing `fi` to find "File"), so that narrowing feels the same as the file picker I already know.
4. As a vsconsult user, I want each picker row to show the picker's name and a one-line description of what it does, so that I can tell pickers apart without remembering their names.
5. As a vsconsult user, I want to see the picker's registry id in the tooltip, so that as a power user I can set keybindings or reference it precisely.
6. As a vsconsult user, I want pressing Enter on a picker row to start that picker, so that I can begin narrowing files or grepping from the chooser.
7. As a vsconsult user, I want a `vsconsult.pickPicker` command, so that I can summon the chooser on demand from a keybinding even when a different picker is running or the Panel is hidden.
8. As a vsconsult user, I want Escape from the chooser, on a pinned Panel, to leave me on the chooser (home has no back button), so that Escape stays consistent with every other picker without trapping me.
9. As a vsconsult user, I want Escape from the chooser, on an unpinned Panel, to close the Panel, so that it behaves exactly like escaping any other picker.
10. As a vsconsult user who just exited a picker while the Panel stayed pinned, I want the chooser to reappear automatically, so that I'm never left staring at empty chrome after an exit.
11. As a vsconsult user who cancelled a picker (focus deliberately moved to the editor), I do not want the chooser to yank focus back to the Panel, so that cancel's intent is respected.
12. As a vsconsult user who moved focus to the terminal and back to the pinned vsconsult Panel tab, I want the chooser to be showing when I return to an idle Panel, so that the Panel is never blank when I come back to it.
13. As a vsconsult user, I want the chooser never to list itself as a candidate, so that the list is only ever doorways to *other* pickers.
14. As a vsconsult user, I want the chooser's candidate list ordered alphabetically by label, so that the order is predictable and stable as more pickers are added regardless of registration order.
15. As a vsconsult user, I want the chooser to feel like a normal picker (same keyboard nav, same row layout, same query input), so that I don't have to learn a second interaction model.
16. As a maintainer, I want the chooser to be a registered `Picker` in the registry alongside `file` and `grep`, so that "everything the Panel shows is a registered picker" stays true and no host special-case is introduced.
17. As a maintainer, I want the host to take a `defaultPickerId` at construction rather than hardcoding `"pick"`, so that the host stays a generic machine and a future config setting could rebind the default without touching host logic.
18. As a maintainer, I want the new "start another picker" capability granted through the picker context, so that pickers never reach into the host directly and the boundary invariant is preserved.
19. As a maintainer, I want the chooser to add no new webview view, view-container, or view declaration, so that the single shared view continues to serve every registered picker.
20. As a maintainer, I want the only `package.json` edit to be the new command entry, so that the manifest stays minimal and the chooser remains registration-driven.

## Implementation Decisions

### Domain model (recorded in CONTEXT.md and ADR-0006)

- **The chooser is a registered `Picker`** (id `"pick"`, label "Pick"), a five-part bundle in the `Registry` alongside `file` and `grep`. This preserves the model's uniformity: everything the Panel shows is a registered picker. The glossary term is **"Picker chooser."**

- **`PickerCandidate`** is a new candidate type extending the shared `Candidate` contract — a thin reference carrying the decision-relevant fields of a registered picker, not the full `Picker` bundle. It keeps the chooser's candidates serializable for the webview rows and decoupled from the host-internal `Picker` interface. Its shape encodes the decision:
  ```ts
  // a thin reference to a registered picker, not the Picker itself
  interface PickerCandidate extends Candidate {
    description: string;   // sourced from the registered picker's placeholder
  }
  ```
  `Candidate.id` is the registered picker's id; `Candidate.label` is the registered picker's label. No new field is added to `Picker` — `description` is sourced from each registered picker's existing `placeholder`.

- **The chooser excludes its own id** (`"pick"`) from its candidate set. A doorway, not a doorway to itself.

- **The chooser is the Panel's idle state.** It is shown whenever the Panel is visible and no session is active. The host re-evaluates this on two triggers (see "Re-arm triggers" below); it is not driven by which teardown path ran.

### Host stays picker-agnostic

- **`PickerHost` gains a `defaultPickerId` constructor parameter.** The extension sets it to `"pick"` at activation. The host never names a picker in its own logic — it starts whatever the extension designated as the default. This preserves the ADR-0002 invariant (one shared view serves any registered picker) and leaves a natural seam for a future `vsconsult.defaultPicker` config setting.

- **No `if (id === "pick")` branch** appears in the host. The chooser reaches the host only as `defaultPickerId` and as a normal registered picker looked up by id.

### New picker-context primitive

- **`PickerContext` gains a `startPicker(id: string)` primitive.** The host implements it as `this.start(id)`. The chooser's accept calls `context.startPicker(candidate.id)`. This grants the "a picker may start another picker" capability through the context boundary, mirroring how `executeCommand` is already exposed — pickers never reach into `PickerHost` directly. Test fakes gain a stub for `startPicker`.

### Re-arm triggers

- **Two triggers re-arm the chooser**, evaluated as "Panel visible ∧ no active session ⇒ start `defaultPickerId`":
  1. **A Panel visibility transition** — `WebviewView.onDidChangeVisibility` (plus the initial `resolveWebviewView`). A visibility-triggered re-arm focuses the Panel input as a normal start does.
  2. **Session teardown while the Panel is visible** — covers the case where a picker exits while the Panel stays pinned (the visibility-only trigger would miss it, since `visible` was already `true` and stays `true`). A teardown-triggered re-arm **does not** focus the Panel input, so `runCancel` — which deliberately moved focus to the editor — is never contradicted by a focus yank back to the Panel.
- The host's existing `runExit` / `runCancel` lifecycle is **unchanged** and **not special-cased** for the chooser. The chooser's exit behavior falls out of composing the existing teardown with the idle logic.

### Source / Narrowing / Render / Accept / Preview

- **Source is a snapshot, query-agnostic** (mirrors the file picker): enumerates the registry minus itself, sorted **alphabetically by `label`** (independent of registration order). `queryDriven` is unset (defaults to `false`). To enumerate, the `Registry` interface gains an enumeration method (see below).
- **Narrowing reuses the shared fuzzy primitive** (the same one the file picker uses, no path/field bias). No new narrowing code.
- **Render** returns `RowParts` with `primary = label`, `secondary = picker.placeholder`, `tooltip = id`.
- **Preview is a no-op** — the chooser is a menu, not a document browser. The preview pane is empty during a chooser session.
- **Accept** calls `context.startPicker(candidate.id)`.

### Registry interface change

- **The `Registry` interface gains an enumeration method** (e.g. `all(): readonly Picker[]`) so the chooser's Source can list registered pickers. Today it exposes only `register` and `get`. The new method returns the pickers in registration (insertion) order; the chooser's Source applies the alphabetical-by-label sort itself, keeping the registry unbiased.

### Command and manifest

- **A `vsconsult.pickPicker` command** is declared in `package.json` (commands and activationEvents), invoking `host.start("pick")` — uniform with `vsconsult.findFile` and `vsconsult.liveGrep`. **No new view, view-container, or view declaration**; the shared view serves the chooser.

### Wiring at activation

- In `activate`, the extension constructs `PickerHost` with `defaultPickerId: "pick"`, registers the chooser in the registry alongside the file and grep pickers, and registers the `vsconsult.pickPicker` command. The chooser's registration must occur before any `host.start` can resolve `"pick"`.

## Testing Decisions

### What makes a good test here

Tests assert **external behavior**, not implementation details: the chooser's candidate set, ordering, narrowing results, row parts, accept/preview effects, and the host's idle/visibility/teardown wiring. They do not assert private fields, message ordering beyond what the user observes, or the absence of internal calls. They prefer the highest existing seam.

### Seams (two, both pre-existing — no new seam added)

**Seam A — Picker-seam tests** (prior art: `src/filePicker/index.test.ts`, `src/grepPicker/*.test.ts`): a `createPickerChooser(registry)` factory registers the chooser into a real `Registry`, then drives its bundle parts directly with a fake `PickerContext` that spies on `startPicker`. Covers:
- the chooser has id `"pick"` / label "Pick" / placeholder / emptyState;
- Source enumerates the registry minus the chooser itself (the chooser never lists itself);
- Source returns candidates sorted alphabetically by label, independent of registration order;
- each `PickerCandidate`'s `id`/`label` come from the registered picker and `description` from its `placeholder`;
- narrowing reuses the shared fuzzy primitive (typing `fi` finds "File", `gr` finds "Grep") and returns no matches for a query matching nothing;
- render returns `primary = label`, `secondary = placeholder`, `tooltip = id`;
- accept calls `context.startPicker(candidate.id)` with the chosen picker's id;
- preview is a no-op (calls no context primitive, opens no document).

**Seam B — `PickerHost` integration tests** (prior art: `src/host/host.test.ts`, the mocked-`vscode` harness): covers the host-side wiring that the picker seam cannot reach:
- `defaultPickerId` is auto-started on `resolveWebviewView` (the first configure message carries the chooser's config);
- a Panel visibility transition to visible, with no active session, starts `defaultPickerId`;
- session teardown while the Panel is visible re-arms the chooser (covers the pinned-exit gap that visibility alone misses);
- teardown-triggered re-arm does not invoke the Panel-focus command (does not steal focus), while visibility-triggered re-arm does;
- the new `startPicker` picker-context primitive, invoked from a running chooser's accept, resolves to `host.start(chosenId)` and switches the active session to the chosen picker;
- `vsconsult.pickPicker`, `vsconsult.findFile`, and `vsconsult.liveGrep` coexist and each invokes `host.start` with the right id;
- the `Registry` enumeration method returns registered pickers (and the chooser's Source sorts them alphabetically) — registry behavior asserted at the picker seam, not duplicated here.

### Why two seams and not one

Bundle behavior (Source/Narrow/Render/Accept/Preview) is highest at the picker seam; the visibility/teardown/idle wiring genuinely requires the mocked-`vscode` harness. They cannot collapse to one without dropping to a lower, more indirect test. Both seams already exist; **no new seam is introduced**.

## Out of Scope

- A `vsconsult.defaultPicker` configuration setting that rebinds `defaultPickerId` (the host seam is shaped for it, but the setting, its `package.json` config declaration, and live-reload wiring are a separate spec).
- A declared `order`/`priority` field on `Picker` for chooser ordering (alphabetical-by-label is the chosen mechanism; a priority field would supersede it only if needed later).
- A non-empty preview for the chooser (e.g. a metadata card showing placeholder/emptyState) — the preview is deliberately a no-op; adding content later is additive and reversible.
- Hiding the preview pane entirely during a chooser session — the model says no-op preview; whether the right-hand area is hidden vs left empty is a render-time layout detail for this spec to settle trivially, not a separate decision.
- Any change to `runExit` / `runCancel` lifecycle semantics — they are reused unchanged.
- Adding new pickers beyond `file`, `grep`, and `pick`.

## Further Notes

- **Architecture of record:** ADR-0006 (`docs/adr/0006-picker-chooser-as-panel-idle.md`) is the architectural decision; the glossary entry "Picker chooser" and the updated "Picker context" (now including `startPicker`) live in `CONTEXT.md`. This spec implements that ADR.

- **Revisable sub-decisions (recorded in ADR-0006 Consequences, cheap to flip):** (1) the exit-vs-cancel re-arm policy — today "teardown-while-visible re-arms, cancel does not steal focus"; flipping is a small patch with no interface change; (2) alphabetical-by-label ordering — one sort line in the Source; registration order or a declared priority could replace it without touching the model.

- **Open implementation question to resolve early:** confirm in real VSCodium whether `WebviewView.onDidChangeVisibility` fires when clicking an *already-visible pinned* Panel tab to refocus it. The VS Code issue tracker flags spurious/non-firing as a known bug. The teardown-while-visible trigger already covers the post-exit re-arm; the only case a visibility-only trigger would miss is "Panel pinned and visible, no session, user clicks its tab from another Panel." If `onDidChangeVisibility` does not fire for that case in practice, a focus/activation hook may be needed as a third trigger — verify before assuming two triggers suffice.

- **Tracker note:** this repo uses a local-markdown tracker in `docs/tickets/` with `Status:` lines (no tracker labels, per `docs/agents/triage-labels.md`). This document is the spec; an implementing ticket in `docs/tickets/` should reference it and carry `Status: ready-for-agent` when cut.