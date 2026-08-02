# Put Picker sessions behind domain messages and isolate VS Code integration

A Picker session is one invocation of a registered Picker. It owns transient picker state and coordination: candidates, query, canonical Selection, source progress and cancellation, preview debounce, result throttling, row limits, and per-operation staleness guards. Its public interface is `start`, domain-message `dispatch`, and `dispose`; asynchronous outputs are published through an injected output sink.

Picker-session messages are project-owned domain messages, not the Shared view's wire protocol. The Picker session accepts query, navigation, selection, accept, cancel, and effect-result inputs. It emits presentation state and typed requests for host effects. The Picker host translates between these messages, the Shared view adapter, and host capabilities. Session identity rejects outputs from replaced sessions; operation generations reject stale source and Preview work within the active session.

The host executes Picker-specific Preview and Accept effects using a narrow Picker context. Completion is the default Accept outcome. An Accept may instead explicitly return a Handoff naming another registered Picker. Handoff replaces the active Picker session without restoring the editor or Panel between sessions.

A Host interaction begins with the first Picker session and ends on final Accept or Cancel. The Picker host captures Return context—Origin and prior Panel visibility—once per Host interaction, preserves it across Handoff, and consumes it only during final Lifecycle. The host also owns the injected default-Picker policy when the Panel is visible and idle; neither PickerSession nor the view names or special-cases the picker chooser.

The Shared view adapter owns the static host-generated HTML/CSS/JavaScript, CSP and nonce handling, DOM behavior, and translation between wire messages and project-owned host messages. It reports visibility and focus events but owns no Picker-session, Lifecycle, or Panel-idle policy. Selection is session-authoritative: the view reports navigation intents or clicked Candidate ids, and renders the selected Candidate id emitted by the session.

One `vscodeEnv` production module constructs focused capability interfaces for workspace sourcing, documents and previews, commands and focus, Lifecycle, configuration, and view registration. Consumers receive only the capabilities they need. Direct `vscode` imports are restricted to this module and the extension entrypoint. PickerHost is a project-owned controller adapted to `WebviewViewProvider` at the entrypoint rather than implementing the VS Code interface itself.

## Considered Options

- **Domain messages behind a Picker-session seam (chosen).** Keeps race-prone streaming, narrowing, Selection, Preview timing, and pressure-control behavior directly testable without a webview or VS Code. It requires explicit translation at the host boundary and typed effect-completion inputs.
- **Reuse the webview wire protocol as the Picker-session interface.** Smaller initial extraction, but couples session behavior to transport and presentation details and leaves tests shaped around the webview.
- **Keep effect execution inside PickerSession.** Reduces host orchestration, but editor integration would occur inside the session boundary and make tests depend on a broad environment.
- **Let the Shared view own Selection.** Preserves the current client-side navigation model, but permits Preview and Accept to diverge when streamed results or capped rows change.
- **Pass one broad `VscodeEnv` everywhere.** Easy to discover and fake, but becomes a shallow service locator and gives every consumer more editor authority than it needs.
- **Run full Cancel Lifecycle before starting a replacement Picker.** Locally simple, but chooser-to-picker transitions restore and recapture editor/Panel state, causing flicker and losing the original invocation context.
- **Keep `PickerContext.startPicker` as an implicit control-flow effect.** Avoids changing Accept outcomes, but makes Handoff order-sensitive and hides whether Accept completes or replaces the interaction.

## Consequences

- Picker-session tests can use fake sources, a fake scheduler, and an output collector; they do not mock `vscode` or simulate webview wire messages.
- Shared-view tests cover document generation, DOM/wire behavior, and translation independently of picker policy.
- Picker-host tests cover message translation, effect execution, Handoff, Return context, Lifecycle, and default-Picker policy using fake capabilities.
- Extension tests only need to prove production capability construction and VS Code registration wiring.
- Source and Preview failures are non-fatal; Accept failure leaves the session active for retry. A session ends only on successful completion, Cancel, replacement, or host disposal.
- Broad stream pressure is controlled before crossing the view boundary: PickerSession narrows, caps, throttles, and emits presentation-ready rows with the canonical selected Candidate id and an uncapped status count.
- Configuration is read through a configuration capability. PickerHost snapshots policy for new sessions and forwards relevant live updates; picker factories receive sourcing configuration through composition.
- The refactor should proceed in vertical test-driven slices: establish domain-message contracts, move session behavior, extract the Shared view adapter, introduce the project-owned host controller, then centralize VS Code capabilities and entrypoint wiring.
