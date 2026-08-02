# Picker session message seam and VS Code boundary

## Problem Statement

vsconsult's user-facing behavior is working, but the behavior most likely to fail under real interaction pressure is concentrated in one oversized host. Source streaming, query replacement, stale-operation guards, Selection, Preview timing, Accept and Cancel coordination, Panel-idle behavior, VS Code integration, and the Shared view document currently meet inside the same module. As a result, a change to race-prone picker behavior must be tested indirectly by mocking the full VS Code module and simulating webview wire messages.

This makes apparently small fixes risky. A late grep batch can race a newer query, a delayed Preview can target a stale Selection, a chooser-to-picker transition can accidentally recapture the wrong Origin, and a lifecycle change can disturb Panel focus. The implementation has guards for these cases, but their ownership is unclear and their highest practical test seam is currently the VS Code-facing host rather than the Picker session where the behavior belongs.

VS Code API knowledge is also spread across activation, host lifecycle, document and Preview operations, and the virtual Preview provider. These separately invented adapter shapes require different fakes and leave the editor boundary unnamed and porous. Meanwhile, the Shared view's static HTML, CSS, JavaScript, wire protocol, and DOM behavior are embedded in the host, so presentation transport and picker coordination cannot be understood or tested independently.

The user wants existing behavior preserved while this territory becomes safer to change: fast streaming results must remain responsive, Preview and Accept must always target the canonical Selection, Cancel must restore the original editor state, chooser Handoff must remain seamless, and the Panel's idle chooser must retain its focus rules. A maintainer should be able to change Picker-session behavior without loading a webview or mocking VS Code.

## Solution

Put each Picker session behind a project-owned, domain-message interface. One Picker session represents one invocation of a registered Picker and owns its transient candidates, Query, canonical Selection, source work, cancellation, narrowing, result-pressure policy, and pending Preview. It accepts domain inputs through `dispatch`, publishes asynchronous domain outputs through an injected sink, and exposes explicit `start` and `dispose` lifecycle operations.

Keep the Picker host as a project-owned coordinator. It translates Shared view inputs into Picker-session inputs, delivers presentation outputs, executes typed Preview and Accept requests through narrow editor capabilities, preserves Return context across explicit Handoff, runs final Lifecycle, and applies the injected default-Picker policy while the Panel is visible and idle. It does not own candidate state, source races, Preview timing, the Shared view document, or direct VS Code calls.

Extract a host-owned Shared view adapter for the static document, DOM behavior, CSP and nonce handling, webview wire protocol, visibility, and focus events. The adapter translates wire messages into project-owned inputs and renders project-owned presentation outputs. The Picker session remains authoritative for Selection; the view sends navigation intent or a clicked Candidate id rather than deciding which Candidate Preview or Accept should use.

Centralize production editor integration in a `vscodeEnv` module that constructs focused capability interfaces. Consumers receive only the workspace, document/Preview, command/focus, Lifecycle, configuration, or view-registration capabilities they need. Direct VS Code imports are limited to that environment module and the extension entrypoint.

The refactor preserves user-visible behavior. It changes where behavior lives and how it is tested, not what the picker does.

## User Stories

1. As a vsconsult user, I want file picking to behave exactly as before the refactor, so that architectural cleanup does not interrupt my workflow.
2. As a vsconsult user, I want live-grep batches to remain responsive while matches stream in, so that broad searches do not freeze or backlog the Shared view.
3. As a vsconsult user, I want changing a query to discard results from the previous query, so that stale matches never replace current matches.
4. As a vsconsult user, I want rapid query changes to remain race-safe even when cancelled source work completes late, so that the displayed results always belong to the current Query.
5. As a keyboard user, I want navigation to wrap and remain predictable, so that moving through candidates feels consistent as results change.
6. As a keyboard user, I want Preview to follow the canonical Selection, so that the editor never previews a different Candidate from the highlighted row.
7. As a keyboard user, I want Accept to commit the canonical Selection, so that Enter cannot accept a stale or disappeared Candidate.
8. As a user of a streaming Picker, I want Selection to remain valid when new batches arrive, so that incremental updates do not silently desynchronize highlight, Preview, and Accept.
9. As a user of a streaming Picker, I want Selection to recover deterministically when its Candidate disappears after a Query change, so that navigation and Preview continue from a valid row.
10. As a user, I want Preview to remain debounced, so that quickly moving through candidates does not perform unnecessary editor work.
11. As a user, I want a delayed Preview from an old Selection to be ignored, so that the editor cannot jump backward after I have moved on.
12. As a user, I want Preview failure to leave the Picker usable, so that an unreadable or unsupported Candidate does not eject me from the interaction.
13. As a user, I want source failure to be reported without destroying the Picker session, so that I can revise the Query or Cancel deliberately.
14. As a user, I want Accept failure to leave the Picker active, so that I can retry, select another Candidate, or Cancel.
15. As a user, I want successful Accept to perform the Picker's commit effect and then complete the Host interaction, so that normal Pickers retain their current lifecycle.
16. As a user, I want Escape to cancel the complete Host interaction and restore the original editor and Selection, so that transient navigation remains non-committal.
17. As a user, I want the Panel's prior visibility restored at final exit, so that vsconsult returns editor space consistently.
18. As a user, I want choosing a Picker from the Picker chooser to transition directly into that Picker, so that the editor and Panel do not flicker between sessions.
19. As a user, I want chooser Handoff to preserve the Origin captured before opening the chooser, so that cancelling the destination Picker returns to the actual starting editor.
20. As a user, I want chooser Handoff to preserve the original Panel-visibility snapshot, so that final exit restores the state from before the overall interaction.
21. As a user, I want the Picker chooser to remain the visible Panel's idle state, so that the refactor does not reintroduce empty Shared view chrome.
22. As a user, I want Cancel to leave focus in the restored editor even when the chooser is re-armed in a pinned Panel, so that the idle policy does not steal focus.
23. As a user, I want opening or refocusing an idle vsconsult Panel to focus its default Picker normally, so that keyboard input works immediately.
24. As a maintainer, I want one Picker session to have a precise lifetime from start until completion, Cancel, Handoff, replacement, or disposal, so that transient ownership is unambiguous.
25. As a maintainer, I want Picker-session inputs and outputs to use domain messages rather than webview wire messages, so that interaction logic is independent of presentation transport.
26. As a maintainer, I want asynchronous session output to use one injected sink, so that immediate and delayed work follows one observable channel.
27. As a maintainer, I want outputs from a replaced Picker session rejected by session identity, so that disposed sessions cannot affect the active interaction.
28. As a maintainer, I want source and Preview work guarded by operation generations, so that cancellation does not rely on `AbortSignal` preventing every late completion.
29. As a maintainer, I want the Picker session to own result narrowing, capping, and throttling, so that pressure control stays beside candidate and Query state.
30. As a maintainer, I want presentation outputs to carry the uncapped result count, capped rows, and canonical selected Candidate id, so that the Shared view can render without reconstructing picker semantics.
31. As a maintainer, I want Preview and Accept represented as typed effect requests, so that the session coordinates behavior without gaining editor authority.
32. As a Picker author, I want ordinary Accept completion to remain the default, so that simple Pickers do not need ceremonial control-flow results.
33. As a Picker author, I want Handoff to be an explicit Accept outcome, so that starting another Picker is visible and type-checked rather than hidden in an editor-effect context.
34. As a maintainer, I want session control removed from Picker context, so that editor effects and Host-interaction control cannot be confused.
35. As a maintainer, I want Return context captured once per Host interaction, so that replacement sessions cannot accidentally make a Preview editor the new Origin.
36. As a maintainer, I want the host to own default-Picker policy without naming the Picker chooser, so that the host remains generic and registration-driven.
37. As a maintainer, I want the Shared view's static document and wire protocol in a dedicated adapter, so that DOM behavior can change without touching Picker-session coordination.
38. As a maintainer, I want the Shared view to send navigation intents rather than authoritative indexes, so that streamed or throttled result changes cannot make an index refer to the wrong Candidate.
39. As a maintainer, I want PickerHost to be a project-owned controller rather than a VS Code provider implementation, so that host orchestration can be tested through project-owned ports.
40. As a maintainer, I want one production module to own direct VS Code operations, so that the editor boundary is easy to find and audit.
41. As a maintainer, I want focused editor capability interfaces rather than a broad environment service locator, so that each consumer receives only the authority it needs.
42. As a maintainer, I want typed configuration read through an injected capability, so that session policy remains testable and live settings remain supported.
43. As a maintainer, I want session policy snapshotted at session start and relevant live changes forwarded explicitly, so that configuration ownership is predictable.
44. As a maintainer, I want existing Picker, Source, Preview, Accept, Lifecycle, virtual Preview, and Panel-idle behavior characterized at stable seams before it moves, so that the refactor does not silently change behavior.
45. As a maintainer, I want the oversized host tests replaced by focused contract tests, so that failures identify session, view, host, or editor-wiring defects directly.
46. As a maintainer, I want direct VS Code imports limited to the environment module and extension entrypoint, so that accidental editor coupling is mechanically visible.
47. As a maintainer, I want the migration delivered in green vertical slices, so that each ownership move can be reviewed and reverted independently.
48. As a future Picker author, I want the host and Shared view to remain Picker-agnostic, so that new Picker types require registration and Picker behavior rather than host branches.

## Implementation Decisions

### Domain ownership

- `Picker` means the registered five-part definition of one Picker type. Invoking it creates a `PickerSession`; the definition itself is not runtime interaction state.
- A Picker session is one invocation from start until successful completion, Cancel, Handoff/replacement, or disposal. It owns Candidates, Query, canonical Selection, source progress and cancellation, Preview timing, narrowing, row shaping, result capping, result throttling, and operation-staleness guards.
- A Host interaction begins when an idle host starts its first Picker session and ends only on final successful Accept or Cancel. It may contain multiple Picker sessions connected by Handoff.
- Return context consists of Origin and prior Panel visibility. PickerHost captures it once when a Host interaction begins, preserves it across Handoff, and consumes it during final Lifecycle. PickerSession never owns Return context.

### Picker-session contract

- PickerSession exposes three lifecycle operations: explicit start, domain-message dispatch, and disposal. Construction does not begin asynchronous source work.
- The session is constructed with a Picker, typed policy values, scheduler/timer primitives, and one output sink. State is observed through outputs rather than public mutable accessors.
- Inputs are project-owned domain messages. They cover Query changes, navigation intents, clicked-Candidate selection, Accept, Cancel, host-effect completion or failure, and relevant policy updates. They are not aliases of the Shared view wire protocol.
- Outputs are project-owned domain messages. They cover presentation state, status, typed Preview requests, typed Accept requests, and terminal session outcomes.
- Presentation state includes presentation-ready Row parts, an uncapped total count/status, and the canonical selected Candidate id. The Shared view does not narrow, cap, rank, or infer the selected Candidate.
- Asynchronous work publishes through the same injected output sink. Outputs accepted from the active operation are delivered in emission order.
- PickerHost associates every output sink with a session identity and ignores output from a replaced or disposed session.
- PickerSession uses independent operation generations for source runs and Preview requests. A late completion is ignored unless both the session and operation generation are current. `AbortSignal` still requests cancellation but is not the sole correctness guard.

### Selection and navigation

- PickerSession is authoritative for Selection. It validates that a selected Candidate id belongs to the currently visible result set.
- Keyboard navigation reaches the session as intent, including relative movement and boundary movement. Click selection reaches it as a Candidate id. Absolute row indexes do not cross the adapter boundary.
- Wrap-around, first Selection, preservation across compatible result updates, and deterministic fallback when a selected Candidate disappears are session behavior.
- Preview scheduling and Accept always derive from the current canonical Selection rather than trusting a Candidate id supplied at commit time by the Shared view.

### Source, results, and Preview coordination

- PickerSession starts snapshot and stream Sources, accumulates streamed batches, and re-runs query-driven Sources when Query changes according to the existing Source contract.
- Replacing a query-driven source run aborts the previous controller and advances its source generation before new results can be accepted.
- Result pressure is controlled before crossing the Shared view boundary. PickerSession performs narrowing, computes the true count, applies the configured row cap, shapes rows, and uses the existing leading-plus-trailing throttle behavior for cumulative stream updates.
- PickerSession owns the Preview debounce timer and Preview generation. When the timer settles, it emits a typed Preview request carrying the current Candidate and operation token.
- PickerHost executes Preview through a narrow Picker context and dispatches typed success or failure back to the originating active session. Preview failure is non-fatal.

### Accept, Cancel, and Handoff

- PickerSession emits a typed Accept request for the canonical Selection. PickerHost executes the Picker's Accept through a narrow Picker context and reports the outcome.
- Completion is the default Accept outcome. Existing ordinary Pickers may continue returning no explicit outcome; successful return means complete.
- Handoff is an explicit alternative Accept outcome naming the next registered Picker id. Picker-context editor helpers do not include a start-Picker operation. The picker chooser preserves its current behavior by returning `Handoff(candidate.id)` from Accept instead of calling `PickerContext.startPicker`.
- On Handoff, PickerHost disposes the outgoing session's source, timers, and virtual Preview; starts the destination Picker session; and preserves the current Host interaction and Return context. It does not run Cancel, restore Origin, restore Panel visibility, or recapture Return context between sessions.
- If Accept or Handoff execution fails, PickerHost reports failure to the active session and leaves it usable. It does not complete the Host interaction.
- Cancel ends the Host interaction, disposes active session work, restores Origin or editor focus, restores prior Panel visibility, and preserves the established focus ordering.
- Successful completion runs the existing exit behavior after the Picker-specific effect. Session teardown remains idempotent.

### PickerHost responsibilities

- PickerHost is a project-owned controller adapted to VS Code provider registration at the extension boundary. Its public responsibilities are resolving/attaching a Shared view adapter, starting a Picker by registered id, coordinating inputs and outputs, and disposal.
- PickerHost translates Shared view inputs into Picker-session inputs, routes session presentation outputs to the adapter, executes typed effects, owns Host interaction and Return context, runs Lifecycle, and applies default-Picker policy.
- PickerHost remains Picker-agnostic. The default Picker is injected by id; no host branch names or detects the Picker chooser.
- When the Panel is visible and no Picker session is active, PickerHost starts the injected default Picker. Visibility/refocus starts may focus the input; teardown-triggered re-arming must not steal editor focus after Cancel.
- PickerHost reads typed configuration through a configuration capability. It passes session-policy snapshots to new sessions, forwards relevant live policy updates, and supplies sourcing configuration to Picker construction through composition.

### Shared view adapter

- The Shared view adapter owns the static host-generated HTML, CSS, JavaScript, CSP, nonce handling, DOM interaction, and webview wire-message validation and serialization.
- The adapter exposes project-owned ports to PickerHost: domain-oriented user/visibility/focus inputs and presentation outputs. Picker/session, Lifecycle, Return-context, registry, and default-Picker policy do not enter the adapter.
- The static document is generated once when the real webview resolves. Switching Picker type continues to reconfigure the same Shared view through messages rather than replacing its HTML.
- The adapter sends navigation intent and clicked Candidate ids. It renders the selected Candidate id supplied by the session and may retain local DOM mechanics only when they cannot change domain Selection.
- Ready/reload reconstruction remains supported: PickerHost can replay the active Picker's full presentation state after the adapter reports readiness.

### VS Code environment boundary

- One production `vscodeEnv` module constructs focused capability interfaces for workspace sourcing, documents and virtual Preview, commands and focus, Lifecycle, configuration, and Shared-view registration/transport.
- Consumers accept only the capabilities they use. There is no broad environment object passed through the application as a service locator.
- Direct imports of the VS Code package are restricted to `vscodeEnv` and the extension entrypoint. Core Picker, PickerSession, PickerHost, Shared view adapter policy, Lifecycle orchestration, and Preview-content policy use project-owned types and injected capabilities.
- The extension entrypoint remains the composition root. It builds production capabilities, assembles Picker factories and the Registry, adapts PickerHost to provider registration, registers commands, and wires the injected default Picker id.
- Existing virtual Preview behavior remains session-bounded and uses one stable virtual document. Moving VS Code calls behind capabilities does not alter the bounded-content or editor-history policy established by the existing Preview ADR.

### Error and disposal policy

- Source failure emits an error status but does not end the session. The user may change Query or Cancel.
- Preview failure is non-fatal and cannot complete the session.
- Accept failure leaves the session active for retry or another Selection.
- A Picker session ends only on successful completion, Cancel, Handoff/replacement, or host disposal.
- Disposal aborts source work, cancels timers and pending result delivery, invalidates operation generations, closes the session-owned virtual Preview, and makes subsequent asynchronous output inert.

### Migration

- Implementation proceeds in vertical test-driven slices: establish domain-message contracts and tests; move session behavior incrementally; extract the Shared view adapter; introduce the project-owned host controller; centralize VS Code capabilities; then simplify extension wiring.
- Existing externally observable behavior is characterized before each responsibility moves. A slice is complete only when the new focused tests and the retained higher-level behavior tests pass.
- Historical specifications and tickets may describe `PickerContext.startPicker`; this spec and ADR-0007 supersede that mechanism with explicit Handoff. Historical documents remain records of the behavior delivered at that time.

## Testing Decisions

- Tests assert externally observable contracts: accepted domain inputs, emitted outputs, invoked capabilities, lifecycle ordering, rendered wire messages, and user-visible behavior. They do not inspect private fields, timer handles, internal arrays, or helper-call structure.
- The primary and highest new seam is PickerSession's domain-message boundary. Most state-machine behavior is tested by constructing a session with fake Sources, fake scheduler primitives, policy values, and an output collector, then asserting ordered outputs.
- PickerSession contract tests cover snapshot sourcing, streamed batches, query-driven source replacement, source completion, source errors, stale source batches, narrowing, true counts, row caps, leading/trailing throttling, initial Selection, navigation, wrap-around, click selection, Selection preservation and fallback, Preview debounce, stale Preview completion, Accept requests, Cancel, failure recovery, and disposal.
- Fake time is used for Preview debounce and result throttling. Tests advance the clock intentionally and assert domain outputs rather than relying on real delays.
- Race tests prove both levels of invalidation: PickerHost rejects output from a replaced session, and PickerSession rejects stale work from a superseded source or Preview generation inside the active session.
- Shared view adapter contract tests cover static document generation, CSP/nonce placement, ready signaling, wire-message validation, Query input, navigation intents, click selection, Accept and Cancel intent, visibility/focus reporting, presentation rendering, canonical selected-id rendering, and full-state reconstruction after reload.
- PickerHost contract tests use fake Registry, Shared view port, PickerSession factory, focused editor capabilities, and configuration capability. They cover translation, effect execution, successful completion, non-fatal failures, Cancel ordering, Return-context capture, explicit Handoff, replacement cleanup, unknown Picker ids, default-Picker re-arming, Panel visibility, focus preservation, configuration snapshots, and disposal.
- VS Code environment tests cover capability adaptation at the editor boundary: URI and position conversion, document and virtual-Preview operations, commands/focus, Lifecycle operations, configuration updates, webview/provider registration, and resource disposal. They mock VS Code only at this boundary.
- A small extension composition test proves Picker registration, command registration, provider adaptation, capability construction, and the injected default Picker id. It is not used to re-test session behavior.
- Existing tests for Source, Narrowing, Render, Accept, Preview-content policy, virtual Preview, debounce, Lifecycle, protocol shaping, Registry, file Picker, grep Picker, and Picker chooser remain prior art. Tests currently buried in the broad host suite should move to the highest owning seam rather than being duplicated.
- Behavioral regression coverage must retain: file Picker start/query/navigation/Preview/Accept/Cancel; live-grep streaming and stale-query cancellation; bounded virtual Preview and stale Preview safety; chooser Handoff; initial and pinned-Panel idle chooser; ready/reload reconstruction; and focus restoration.
- An architectural check verifies that direct VS Code imports exist only in the environment module and extension entrypoint.
- The full existing test suite, type checking, and extension build/package checks must pass after every completed migration slice and at completion.

## Out of Scope

- Adding a new Picker type, command, view, or Panel container.
- Changing file, grep, or Picker-chooser ranking, labels, Row parts, source semantics, or commit effects.
- Changing the user-visible Shared view layout, styling, keyboard bindings, status wording, or empty states except where canonical Selection rendering requires protocol-compatible state.
- Consolidating each Picker type's Source, Narrowing, Render, Accept, and Preview files into one module.
- Removing the separate dead matcher implementation identified by the architecture review.
- Changing the snapshot-or-stream Source contract or the bounded virtual Preview content/resource policy.
- Introducing webview virtualization or changing the configured maximum-row behavior beyond moving ownership into PickerSession.
- Making the default Picker configurable by users; the id remains injected by composition as today.
- Supporting nested Host interactions or a stack of Return contexts. Handoff is replacement within one Host interaction.
- Replacing the local Registry, changing manifest contribution structure, or adding third-party runtime Picker loading.
- Rewriting historical completed tickets and specifications to use the new terminology; ADR-0007 and this spec supersede conflicting implementation mechanisms.

## Further Notes

- This spec implements ADR-0007 and preserves ADR-0002's single static Shared view, ADR-0003's query-aware snapshot-or-stream Source, ADR-0004's bounded virtual Preview, and ADR-0006's registered Picker chooser as Panel idle state.
- The domain glossary defines Picker, Picker session, Host interaction, Return context, Shared view adapter, Accept, Handoff, Picker context, Lifecycle, Selection, Preview, and Origin. Implementation and tests should use those terms consistently.
- The target is an ownership refactor, not a feature redesign. Success is measured by unchanged user behavior, direct tests for race-prone session behavior, a thin project-owned PickerHost, an independently testable Shared view adapter, and one explicit VS Code integration boundary.
- The agreed completion bar is: layered contract tests pass; existing behavior remains covered; PickerHost only orchestrates, translates, executes effects, and delivers; implicit `PickerContext.startPicker` control flow is gone; and direct VS Code imports are limited to `vscodeEnv` and the extension entrypoint.
