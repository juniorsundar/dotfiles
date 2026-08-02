# 17 — PickerSession owns source, Query, narrowing, and results pressure

**What to build:** Introduce the PickerSession seam and move the first band of host behavior into it: starting a source (snapshot and stream), accumulating streamed batches, running query-driven source replacement, narrowing, computing the true result count, applying the configured row cap, shaping rows, and the leading-plus-trailing cumulative results throttle. PickerSession exposes explicit start, domain-message dispatch, and dispose; it is constructed with a Picker, typed policy values, scheduler primitives, and one injected output sink. Its inputs are project-owned domain messages (Query change, source-effect completion/failure), not the Shared view wire protocol; its outputs are presentation-ready rows, uncapped count/status, and terminal/progress messages through the sink. PickerHost still owns the webview and executes effects, but it now creates a session, forwards Query inputs, and renders session outputs to the wire. The host's old stream loop, narrowing, capping, and throttle move into the session. Behavior is unchanged: file picker sourcing, grep streaming, query-change cancellation, truncation status, and stream completion all behave as before, now exercised directly through session tests plus the retained host-seam tests from ticket 16. Session-identity and source-generation guards replace the host's in-flight guards: outputs from a replaced session are ignored, and late source batches are dropped by generation.

**Blocked by:** 16 — Characterize the recent bug-fix behaviors at the host seam.

**Status:** ready-for-agent

- [ ] A PickerSession module exists with start, dispatch, and dispose, constructed with a Picker, policy values, scheduler primitives, and one output sink.
- [ ] Snapshot sourcing, streamed-batch accumulation, narrowing, true-count, row cap, row shaping, and leading-plus-trailing results throttling are owned by PickerSession and exercised through domain messages.
- [ ] Query-driven source replacement aborts the previous source run and advances a source generation; stale source batches from a superseded run are dropped by generation, not only by AbortSignal.
- [ ] PickerSession publishes presentation state (presentation-ready rows, uncapped count/status) through the injected sink; PickerHost translates session outputs to the Shared view wire protocol.
- [ ] New PickerSession contract tests cover snapshot sourcing, streamed batches, query-driven replacement, source completion, source error, stale batch rejection, narrowing, capping, true counts, and throttling using fake sources, a fake scheduler, and an output collector.
- [ ] File picker sourcing, grep streaming, query-change cancellation, truncation status wording, and stream completion remain behaviorally identical at the host seam and in the existing suite.
- [ ] The tests from ticket 16 still pass unchanged.
- [ ] The full test suite, type checking, and build pass.