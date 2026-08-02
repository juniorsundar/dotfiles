# The Panel's idle state is a registered picker-chooser

When the bottom Panel is visible with no picker session active, it shows the **picker chooser**: a registered picker (id `"pick"`, label "Pick") whose candidates are the other registered pickers. Accepting a candidate starts that picker. This eliminates the empty-chrome state the Panel would otherwise show on first open and after a picker exits while pinned, making the chooser the Panel's home screen.

The chooser is reached not by special-casing the host but through an injected `defaultPickerId`: the extension sets it to `"pick"` at activation, and the host starts it whenever the Panel is visible and idle. The host remains picker-agnostic — it never names a picker in its own logic — preserving the invariant from ADR-0002 (one shared view serves any registered picker).

## Considered Options

- **Registered picker-chooser, reached via injected `defaultPickerId` (chosen).** The chooser is a five-part `Picker` bundle in the registry alongside `file` and `grep`; the host auto-starts `defaultPickerId` when the Panel is visible and idle. Keeps "everything the Panel shows is a registered picker" and "the host never names a picker" both true. Uniform with the existing model: the chooser earns a `vsconsult.pickPicker` command like every other picker.

- **Host-level default behavior, not a Picker.** The host renders its own candidate list of registered pickers outside the registry. Adds a second, special code path to the host and a second concept of "what the Panel can show," breaking uniformity.

- **A Picker, but not registered.** An inline built-in default following the five-part shape but living outside the `Registry`, so it cannot be invoked by id/command and cannot recurse onto itself. Loses uniformity and the free `vsconsult.pickPicker` command.

- **No chooser; only `resolveWebviewView` starts a default.** Rejected: leaves the pinned-panel exit-then-refocus case showing empty chrome, which is the problem the chooser exists to solve.

## Decision

1. **The chooser is a registered `Picker`** (id `"pick"`, label "Pick"), a five-part bundle in the `Registry` like `file` and `grep`.
2. **`PickerCandidate` is a thin reference** `{ id, label, description }` extending the shared `Candidate` contract; `description` is sourced from each registered picker's `placeholder`. No new field is added to `Picker`.
3. **The chooser excludes its own id** from its candidate set (a doorway, not a doorway to itself).
4. **The chooser is the Panel's idle state**: shown whenever the Panel is visible and no session is active. Re-evaluated on (a) any Panel visibility transition (`onDidChangeVisibility`, plus the initial `resolveWebviewView`) and (b) session teardown while the Panel is visible. Teardown-triggered re-arms do **not** focus the panel input; visibility-triggered re-arms do, so `runCancel` (which deliberately moved focus to the editor) never yanks focus back.
5. **The host takes a `defaultPickerId` at construction**; the extension sets it to `"pick"`. The host never names a picker in its own logic.
6. **A `vsconsult.pickPicker` command** is declared in `package.json`, invoking `host.start("pick")`, uniform with `vsconsult.findFile`/`vsconsult.liveGrep`.
7. **Source is a snapshot, query-agnostic**: enumerates the registry minus itself, sorted alphabetically by `label` (independent of registration order). `queryDriven` is unset (defaults false).
8. **Narrowing reuses the shared fuzzy primitive** (same as the file picker, no bias). No new narrowing code.
9. **Render** returns `primary = label`, `secondary = picker.placeholder`, `tooltip = id`.
10. **Preview is a no-op**: the chooser is a menu, not a document browser.
11. **Accept calls `context.startPicker(candidate.id)`**, a new primitive on `PickerContext` the host implements as `this.start(id)`. The chooser never reaches into `PickerHost` directly; the "a picker may start another picker" capability is granted through the context, mirroring `executeCommand`.
12. **No special exit behavior.** The chooser uses the existing `runExit` + idle logic. Escape from the chooser on a pinned Panel re-arms the chooser (home has no back button); on an unpinned Panel, `runExit` closes the Panel as for any picker.

## Consequences

- **New `PickerContext.startPicker(id)` primitive.** One method added to the context surface and its host implementation; test fakes gain a stub. This is the only new host-facing seam: pickers may now start other pickers through the context, a capability that generalizes to future "drill-in" pickers.
- **`defaultPickerId` on the host constructor.** A new construction parameter owned by the extension's `activate`. The host stays a generic machine: "start whatever the extension designated as default." A future `vsconsult.defaultPicker` configuration setting can rebind it without touching host logic.
- **Re-arm triggers are two, not one.** `onDidChangeVisibility` alone does not fire when a pinned Panel is merely re-clicked/refocused, so a visibility-transition-only trigger would leave an empty chrome gap after a pinned-panel exit. The teardown-while-visible trigger closes that gap. The teardown re-arm deliberately does not focus the input, preserving `runCancel`'s intent.
- **One `package.json` command entry** (`vsconsult.pickPicker`), consistent with the existing per-picker command entries. No new view, view-container, or view declaration — the shared view serves the chooser as it does every picker.

### Revisable sub-decisions (cheap to flip; recorded, not architectural)

- **Exit-vs-cancel re-arm policy.** The two-trigger rule (visibility transition + teardown-while-visible, with teardown not focusing) is a behavioral policy living in the host's teardown/visibility wiring. Flipping it later is a small patch with no interface change; it is recorded here so a future change is scoped, not rediscovered.
- **Alphabetical candidate ordering.** The Source's alphabetical-by-label sort is one line. Registration order or a declared priority could replace it without touching the model.

## Open questions deferred to implementation (not decisions)

- Confirm `WebviewView.onDidChangeVisibility` fires on the Panel-tab-click transition in real VSCodium (the VS Code issue tracker flags spurious/non-firing as a known bug). If it does not fire for the "click an already-visible pinned Panel tab" case, the teardown-while-visible trigger already covers the post-exit re-arm; the only uncovered case would be "Panel pinned and visible, no session, user clicks its tab from another Panel" — verify whether that produces a visibility event in practice, and whether a focus/activation hook is needed as a third trigger.
- Decide whether the chooser session should suppress the preview pane entirely (hide the right-hand area) versus leave it empty. The model says "no-op preview"; the layout question is a render-time detail for the implementing ticket.