# vsconsult prototype

## Objective

Validate that a Consult-like workspace-file picker feels good as a transient, keyboard-first interaction inside VSCodium's bottom Panel.

## Interaction

1. Run **vsconsult: Find File** from the Command Palette.
2. Reveal the dedicated **vsconsult** Panel tab and focus an empty query.
3. Show up to 2,000 workspace-file candidates.
4. Fuzzy-match the query against each workspace-relative path.
5. Render the filename as the primary label and its containing path as secondary metadata.
6. Move the selection with Up/Down or Ctrl+P/Ctrl+N.
7. Preview the selection after a short debounce of roughly 100–150 ms.
8. Press Enter to accept the selected file, exit, and focus its editor.
9. Press Escape to cancel, restore the origin editor and selection, and exit.

On exit, restore whether the bottom Panel was visible before invocation. The prototype does not promise to reactivate the exact Panel tab that had been selected.

## Success criteria

- The command reveals vsconsult and puts keyboard focus in its query input.
- An empty query displays a deterministic list of workspace files, capped at 2,000 with a visible cap notice when applicable.
- Query changes responsively narrow and fuzzy-rank candidates by full workspace-relative path.
- Filename and containing path remain legible in compact, theme-aware rows.
- Arrow and Emacs navigation keys produce the same selection behavior.
- Rapid navigation does not open every traversed file; preview is debounced.
- Enter commits the selection and Escape restores the origin.
- Exit restores prior Panel visibility as far as the public Extension API permits.

## Out of scope

- Multiple candidate sources
- Configurable layouts or keybindings
- Rich file metadata, badges, or syntax-highlighted excerpts
- A side-by-side preview pane
- Persistent recency or ranking history
- Large-workspace indexing beyond the 2,000-candidate cap
- Publishing to Open VSX
