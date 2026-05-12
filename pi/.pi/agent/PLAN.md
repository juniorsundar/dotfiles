# Plan: Improve `extensions/confirm-mutating-tools.ts`

Goal: keep the Neovim approval workflow, but make it safer, clearer, and more pleasant to use.

Ordered roughly from easiest to hardest.

## 1. Improve temporary file names and syntax highlighting — DONE

Related idea: 14

- Preserve the target file's real basename and extension in temp files.
- Use names like:
  - `before.<basename>`
  - `after.<basename>`
- Ensure extension detection still works for files with multiple suffixes, e.g. `config.test.ts`, `flake.nix`.
- Handle paths without a basename by falling back to `file.txt`.

Acceptance check:
- Opening a TypeScript file shows TypeScript syntax highlighting in Neovim.
- Opening a Nix file shows Nix highlighting when the user's Neovim supports it.

## 2. Add post-decision summaries — DONE

Related idea: 11

- After approval, show a Pi notification like:
  - `Approved edit: foo.ts (+12/-3)`
  - `Approved write: foo.ts (+40/-0)`
- After denial, show:
  - `Denied edit: foo.ts`
  - `Denied write: foo.ts`
- Compute basic line additions/deletions from before/after content.

Acceptance check:
- Every approve/deny path produces a concise notification.

## 3. Improve Neovim layout defaults — DONE

Related idea: 15

In the generated approval Lua:

- Use vertical diff layout where practical, but switch to horizontal/top-bottom in narrow terminals or tmux panes.
- Equalize split widths/heights.
- Jump to the first diff hunk.
- Enable useful diff options:
  - `diffopt+=algorithm:histogram`
  - `diffopt+=indent-heuristic` when supported
- Disable wrapping for easier side-by-side diffs.
- Keep user's colorscheme/theme loaded first.

Acceptance check:
- `/nvim-diff-demo`-style approval opens in a clean side-by-side diff when there is enough width.
- Narrow tmux panes use a readable horizontal/top-bottom diff.
- Cursor starts near the first change.

## 4. Add persistent Neovim metadata/status display — DONE

Related idea: 3

Add a persistent `winbar` or `statusline` message showing:

- Tool: `edit` or `write`
- Target path
- Commands: `:Approve`, `:Deny`

Example:

```text
Pi Approval | edit | src/foo.ts | :Approve :Deny
```

Acceptance check:
- The approval instructions stay visible after moving around, not just as a one-time `echo`.

## 5. Add tool-specific workflows and metadata — DONE

Related idea: 7

For `write`:

- Detect whether the target file currently exists.
- Label the workflow as:
  - `new file`
  - `overwrite existing file`
- Show before/after line counts.

For `edit`:

- Show number of edit blocks.
- Show before/after line counts.
- If possible, jump to the first edited region.

Implementation options:

- Put metadata in the Neovim statusline/winbar.
- Or create a small read-only scratch buffer later if statusline becomes too cramped.

Acceptance check:
- Write approvals clearly distinguish new files from overwrites.
- Edit approvals show edit block count.

## 6. Add a global approval queue for parallel tool calls — DONE

Parallel subagents or parallel tool execution can trigger multiple edit/write approvals at the same time. Since Neovim needs exclusive terminal control, approval prompts should be serialized.

Implementation:

- Add an in-memory promise queue inside `confirm-mutating-tools.ts`.
- Route every `edit`, `write`, and maybe `bash` approval through this queue.
- Only one approval UI may run at a time.
- Build the preview inside the queued task, not before queueing, so it uses the latest file state.
- For file changes, re-read the target file immediately before opening Neovim.

Recommended simple policy:

1. Queue all approval prompts globally.
2. For each queued approval:
   - Re-read the current target file.
   - Build the before/after preview.
   - Open Neovim approval.
   - Allow or block the tool call.
3. Later, optionally add per-file queueing if global serialization feels too strict.

Acceptance check:
- Two parallel edit/write calls never open two Neovim instances at once.
- The second approval sees the latest file content after the first approved mutation.

## 7. Add large-file and binary safeguards — DONE

Related idea: 13

Before opening Neovim:

- Detect very large content by byte size and/or line count.
- Detect likely binary content, e.g. NUL bytes or invalid UTF-8 read fallback.
- Suggested defaults:
  - warn above 1 MB
  - warn above 20,000 lines
  - block or metadata-confirm binary-like files

Flow:

1. If content is normal, open Neovim approval directly.
2. If content is large, show Pi confirm first:
   - `Large diff: 2.4 MB / 35k lines. Open in Neovim anyway?`
3. If binary-like, do not open diff by default. Show metadata-only confirmation or block.

Acceptance check:
- Huge writes do not unexpectedly freeze the terminal.
- Binary-like files are not opened as broken text diffs.

## 8. Add exact edit preview validation — DONE

Related idea: 4

The current preview applies edit blocks with simple string replacement. Make it safer:

- For each edit block, count occurrences of `oldText` in the current preview content.
- If count is `0`, mark validation failure.
- If count is greater than `1`, mark validation failure or warning.
- Only build the Neovim preview when every edit block has exactly one match.
- If validation fails, block by default or ask with a very explicit warning.

Suggested behavior:

- Validation success: open Neovim diff approval.
- Validation failure: show Pi confirm with details and recommend denial.

Acceptance check:
- The Neovim diff always reflects the actual edit that will be applied.
- Ambiguous or impossible edit previews are not silently shown as trustworthy.

## 9. Re-check file state after approval — DONE

This complements the global approval queue and exact edit validation.

Problem:

- The file can theoretically change between preview approval and actual tool execution.
- This is especially relevant with parallel subagents, external editors, file watchers, or background processes.

Implementation:

- Record a lightweight fingerprint of the file before opening Neovim:
  - byte length
  - maybe mtime if available
  - maybe a hash for stronger safety
- After approval, immediately re-read or stat the file.
- If the file changed since preview:
  - block the tool call
  - notify the user: `Blocked edit: file changed after approval; ask the agent to retry.`

Acceptance check:
- Approval cannot be applied to a file state different from what the user reviewed.

## 10. Optional: allow editing the approved `after` buffer — DONE

Related idea: 5

This is the hardest and should be treated as optional.

Potential behavior:

- For `write`:
  - Allow the user to edit the `after` buffer in Neovim.
  - On approval, read the approved `after` temp file.
  - Mutate `event.input.content` to the approved content before allowing the tool call.
- For `edit`:
  - More complicated because the built-in edit tool expects exact replacements.
  - Options:
    1. Keep edit buffers read-only.
    2. If user modifies `after`, block and tell them to ask the agent to perform a write instead.
    3. Convert edit to write by changing tool behavior is likely not safe unless overriding tools.

Recommendation:

- Start with editable `after` buffer for `write` only.
- Keep `edit` approval read-only.

Acceptance check:
- User can tweak generated file content during write approval.
- Approved modified content is what actually gets written.
- Edit approvals remain safe and predictable.
