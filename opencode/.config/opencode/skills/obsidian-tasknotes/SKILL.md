---
name: obsidian-tasknotes
description: >-
  Manipulate Obsidian TaskNotes tasks, track time, run Pomodoro sessions,
  and search the vault via the obsidian CLI.
  Use when the user mentions tasks, task status/priority, time tracking,
  Pomodoro, vault search, follow-ups, or asks to capture a task.
---

# Obsidian TaskNotes via CLI

This vault uses **Obsidian** with the **TaskNotes** plugin. The `obsidian` CLI
connects to the running Obsidian app to read, create, and update tasks.

## User Intent → Command

| User says... | Run this command |
|---|---|
| "Capture a task: \<text\>" | `obsidian tasknotes:capture text="..."` |
| "Exact capture, no NLP" | `obsidian tasknotes:capture literal=true text="..."` |
| "What tasks are pending?" | `obsidian tasks todo` |
| "Show me all tasks" | `obsidian tasks format=tsv` |
| "What's in task X?" | `obsidian read file="X"` |
| "Mark task X as done/in-progress/..." | `obsidian property:set name=status value="\<val\>" path="task_notes/tasks/X.md"` |
| "Change task X priority" | `obsidian property:set name=priority value=\<val\> path="..."` |
| "Tick checkbox on line N" | `obsidian task path="..." line=N done` |
| "Search for Y in vault" | `obsidian search text="Y"` |
| "Search Y with context" | `obsidian search:context text="Y"` |
| "Backlinks to note X" | `obsidian backlinks file="X"` |
| "Links from note X" | `obsidian links file="X"` |
| "List vault files" | `obsidian files` |
| "List files in folder F" | `obsidian files folder="F"` |
| "Start time tracking on X" | `obsidian tasknotes:start-time path="..."` |
| "Stop time tracking" | `obsidian tasknotes:stop-time path="..."` |
| "Check time status" | `obsidian tasknotes:time-status` |
| "Start a 25min Pomodoro" | `obsidian tasknotes:pomodoro duration-minutes=25` |
| "Check Pomodoro status" | `obsidian tasknotes:pomodoro-status` |
| "Cancel Pomodoro" | `obsidian tasknotes:pomodoro-cancel` |
| "Open note X" | `obsidian open path="..."` |
| "Show file metadata for X" | `obsidian file path="..."` |

## Decision Rules

### `property:set` vs `task ... done`

| Operation | What it changes | When to use |
|---|---|---|
| `property:set name=status value="..."` | YAML frontmatter | **TaskNotes tasks** (files in `task_notes/tasks/`) |
| `task ... line=N done/todo` | `[ ]`/`[x]` checkbox in note body | Ad-hoc checklists in any note |

### `path=` vs `file=`

- `path=` — vault-relative path. Fast, exact.
- `file=` — Obsidian resolves like a `[[wikilink]]`. Use when only the note name is known.

### Capture: NLP vs literal

- **NLP** (default): `text="Buy groceries due:tomorrow #errands"` — parsed for title, dates, tags.
- **Literal**: `literal=true` — stores text as-is. Use `title=`, `priority=`, `tags=` explicitly.

## Task Model

Tasks: `task_notes/tasks/<name>.md` with YAML frontmatter.

- **Status**: `todo`, `in-progress`, `follow-up`, `done`, `cancelled`, `open`
- **Priority**: `low`, `normal`, `high`, `critical`

## Error Recovery

| Problem | Action |
|---|---|
| `obsidian: command not found` | Tell user CLI not installed |
| Can't connect to Obsidian | Ask user to open Obsidian app |
| Path/file not found | `glob "task_notes/tasks/*<fragment>*"` to locate |
| Missing frontmatter property | Read file first to check fields |

## Response Format

This vault uses Obsidian Flavored Markdown. In responses:

- Use `[[wikilink syntax]]` for note references
- Always leave blank line before Markdown tables
- Math: `$inline$` and `$$display$$` (not `\(...\)`)

## See Also

- `REFERENCE.md` — all commands with full syntax and flags
- `EXAMPLES.md` — end-to-end workflow scenarios
