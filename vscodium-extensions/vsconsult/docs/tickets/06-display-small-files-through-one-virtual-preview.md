# 06 — Display small files through one virtual preview

**What to build:** When a user cycles through ordinary text-file candidates, show their content in the native editor area through one session-owned, read-only virtual preview document instead of preview-opening each real file. Reuse the same virtual resource as selection changes. Cancelling closes only that preview and restores the origin editor and selection; accepting closes it and opens only the accepted real file.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Cycling ordinary text candidates updates one stable virtual resource in the native editor area without preview-opening candidate real URIs.
- [ ] The selected candidate's filename, path, and readable content are identifiable in the preview while picker focus is preserved.
- [ ] The virtual preview is session-owned and cannot modify the candidate file.
- [ ] Cancelling closes only the virtual preview and restores the origin editor and selection without discarding dirty content.
- [ ] Accepting closes only the virtual preview and opens exactly the accepted candidate under its real URI.
- [ ] Host-level behavioral tests cover stable identity, candidate changes, dirty-origin preservation, accept, and cancel through public effects.
