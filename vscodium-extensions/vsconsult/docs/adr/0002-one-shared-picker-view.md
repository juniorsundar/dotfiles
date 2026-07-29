# One shared webview view serves every picker

The extension declares a single webview view. A command invokes a picker by id; the host loads that picker into the shared view and focuses it. Adding a picker type is code-only — register a Picker object at activation; no `package.json` edit, no new declared view, no republish. The webview HTML is host-owned and static, generated once at resolve; switching picker type reconfigures content (labels, empty-state text, row parts, candidates) via postMessage, not by rewriting `webview.html`.

## Considered Options

- **One shared view, picker chosen at invoke (chosen).** Static manifest regardless of picker count; adding a picker is code-only. Matches the consult model where one window becomes whichever command invoked it. Cost: the webview must re-initialize its state when a different picker is invoked (reset + send new labels + re-source candidates), and only one picker is visible at a time — both acceptable for a transient, modal-ish interaction.
- **One declared view per picker type.** Rejected: every new picker requires a `package.json` edit and republish, so third parties could not add pickers to a published extension. Directly contradicts the project goal of making it easy for others to write more pickers, and multiplies panel views and activation events.
- **One shared view, but each picker ships its own webview HTML injected on invoke.** Rejected: contradicts the render decision (ADR-0002 area — host owns row chrome, pickers return RowParts, never HTML). Re-introduces per-picker HTML and the CSP/theming/consistency problems that decision avoided.

## Consequences

- `package.json` stays small and stable: one viewsContainer, one view, one activation event per *command* (not per picker view). New pickers add commands only if they want Command Palette entries; the view itself is shared.
- The host owns a re-initialization flow on invoke: reset the webview, push the new picker's labels/empty-state, source its candidates. This is the consult lifecycle and is already partially present (`start()` posts `reset`).
- Only one picker is active at a time. A second invocation while one is active replaces it (to be resolved in the lifecycle/session design).
- The webview HTML is generated once; picker-specific appearance is carried entirely by message content, so the render seam (RowParts) stays intact.