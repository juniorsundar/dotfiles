# 09 — Make preview updates race-safe and teardown-safe

**What to build:** Ensure rapid candidate navigation and every picker-exit path leave the virtual preview consistent and isolated. Slow work for an older selection must never replace the current candidate. Replacement, disposal, cancellation, acceptance, and failures must tear down only session-owned preview state without touching unrelated editor groups, preview editors, or dirty documents.

**Blocked by:** 07 — Prove Ctrl+P history containment.

**Status:** ready-for-agent

- [ ] Debouncing limits unnecessary preview reads during rapid keyboard navigation.
- [ ] When preview reads complete out of order, only the latest selection may update the virtual document.
- [ ] Results from an inactive or replaced picker session cannot update or reopen the virtual preview.
- [ ] The virtual preview remains read-only throughout its lifetime.
- [ ] Cancel, accept, picker replacement, disposal, and error paths tear down virtual-preview state idempotently.
- [ ] Teardown closes only the extension-owned virtual resource and never closes editor groups, unrelated preview editors, or dirty documents.
- [ ] Controlled asynchronous host-level tests cover out-of-order completion, session replacement, repeated cleanup, and unrelated-editor preservation.
