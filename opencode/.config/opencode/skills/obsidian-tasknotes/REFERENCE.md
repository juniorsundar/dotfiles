# Command Reference — obsidian-tasknotes

Full syntax reference for the `obsidian` CLI. See `SKILL.md` for workflow
guidance and `EXAMPLES.md` for concrete scenarios.

---

## Reading Notes

Read a note's content from the vault:

```bash
# By vault-relative path (fast, exact)
obsidian read path="task_notes/tasks/<task-name>.md"

# By filename — Obsidian resolves like a [[wikilink]]
obsidian read file="<task-name>"

# Show file metadata (frontmatter, timestamps, etc.)
obsidian file path="task_notes/tasks/<task-name>.md"
```

---

## Capturing Tasks

### NLP mode (default)

Free-text is parsed for title, due dates, tags, priority, and status:

```bash
obsidian tasknotes:capture text="Implement retry mechanism for encryption failure" priority=high tags="SSRC,BUG"
```

| Flag | Description |
|---|---|
| `text=...` | Free-text parsed by NLP (title, details, due dates, tags, etc.) |
| `priority=...` | `low`, `normal`, `high`, `critical` |
| `tags=...` | Comma-separated list (overrides NLP-derived tags) |
| `status=...` | `todo`, `in-progress`, `follow-up`, `done`, `cancelled`, `open` |
| `due=YYYY-MM-DD` | Override NLP-parsed due date |
| `scheduled=YYYY-MM-DD` | Set scheduled date |

### Literal mode

Disables NLP parsing. Text is stored as-is. Use explicit flags for structure:

```bash
obsidian tasknotes:capture literal=true title="Exact Title Here" priority=high tags="work,bug" text="Additional notes body"
```

| Flag | Description |
|---|---|
| `literal=true` | Disable NLP parsing |
| `title=...` | Explicit title |
| `text=...` | Body content (stored verbatim) |
| `priority=...` | `low`, `normal`, `high`, `critical` |
| `tags=...` | Comma-separated list |
| `status=...` | Initial status |
| `due=YYYY-MM-DD` | Due date |
| `scheduled=YYYY-MM-DD` | Scheduled date |

---

## Listing and Querying Tasks

```bash
# List all non-done tasks (default format)
obsidian tasks todo

# List all tasks including done (TSV format for parsing)
obsidian tasks format=tsv
```

---

## Changing Task Status & Properties

For TaskNotes tasks (YAML frontmatter):

```bash
# By property name (full command)
obsidian property:set name=status value="follow-up" path="task_notes/tasks/<task-name>.md"

# Shorthand
obsidian prop name=status value="follow-up" path="task_notes/tasks/<task-name>.md"

# Change priority
obsidian property:set name=priority value=high path="task_notes/tasks/<task-name>.md"
```

To find the line number of a property in the file, read it first with
`obsidian read file="<task-name>"`.

---

## Toggling Inline Checkboxes

For ad-hoc `[ ]` / `[x]` checkboxes in any note (not TaskNotes tasks):

```bash
# Mark checkbox on line N as done
obsidian task path="task_notes/tasks/<task-name>.md" line=12 done

# Mark checkbox on line N as todo
obsidian task path="task_notes/tasks/<task-name>.md" line=12 todo
```

**Note**: Count lines from 1. Use `obsidian read` first to find the correct
line number. This only affects markdown checkboxes, not YAML frontmatter
`status`.

---

## Searching the Vault

```bash
# List filenames matching query
obsidian search text="encryption failure"

# Show surrounding context lines with matches
obsidian search:context text="encryption failure"
```

---

## Time Tracking

```bash
# Start tracking time on a task
obsidian tasknotes:start-time path="task_notes/tasks/<task-name>.md"

# Stop tracking and log elapsed time
obsidian tasknotes:stop-time path="task_notes/tasks/<task-name>.md"

# Check active timer status
obsidian tasknotes:time-status
```

---

## Pomodoro

```bash
# Start a 25-minute focus cycle
obsidian tasknotes:pomodoro duration-minutes=25

# Check remaining time in active session
obsidian tasknotes:pomodoro-status

# Cancel the active Pomodoro
obsidian tasknotes:pomodoro-cancel
```

---

## Navigating the Vault

```bash
# Open a note in Obsidian (brings window to front)
obsidian open path="task_notes/tasks/<task-name>.md"

# List all files in the vault
obsidian files

# List files in a specific folder
obsidian files folder="path/to/folder"

# Show backlinks (incoming links) to a note
obsidian backlinks file="<note-name>"

# Show outgoing links from a note
obsidian links file="<note-name>"
```
