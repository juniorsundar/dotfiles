# 02 — Extract file sourcing with an injectable workspace

**What to build:** The exclude-pattern building (baseline excludes merged with per-folder `.gitignore` and `.gitmodules` contents) and the workspace-file candidate collection are pulled out of the monolithic provider into a standalone file-sourcing module. The module takes injected workspace dependencies (a find-files capability and a read-file capability) rather than calling `vscode.*` directly, so it can be driven without a vscode host. The existing provider calls the new module; behavior is unchanged. This is a prefactor: it makes the file Source a drop-in when the Picker abstraction lands, and it is the seam the spec tests file sourcing through.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] A file-sourcing module produces workspace-file candidates (ids, labels, and file fields) from a set of workspace folders, applying baseline excludes merged with per-folder `.gitignore` and `.gitmodules` contents.
- [x] The module depends on injected workspace capabilities (find-files, read-file) rather than the `vscode` namespace, so it runs without a vscode host.
- [x] `.gitignore` negated patterns (`!`) continue to be ignored (excludes are monotonic), and `.gitmodules` submodule paths continue to be excluded (prior art: existing `gitmodules.ts` parser is reused).
- [x] The existing provider sources candidates identically to before (no user-visible change).
- [x] A test drives the module with a fake workspace (injected find-files returning a fixed file set, injected read-file returning `.gitignore`/`.gitmodules` contents) and asserts the produced candidates and exclude merging.