---
name: obsidian-tasknotes
description: Use when manipulating Obsidian TaskNotes tasks via the obsidian CLI — reading, creating, updating status/priority, time tracking, Pomodoro, and vault search. Trigger keywords: tasknotes, obsidian, task status, task priority, capture task, time tracking, pomodoro, follow-up, in-progress.
---

# Obsidian TaskNotes via CLI

This vault uses **Obsidian** with the **TaskNotes** plugin. The `obsidian` CLI
connects to the running Obsidian app to manipulate tasks.

## Reference: the tasknotes vault

Tasks live in `task_notes/tasks/` as individual `.md` files with YAML frontmatter.
Each task has at minimum: `status`, `priority`, `tags`, and often `scheduled`, `due`, `dateCreated`, `dateModified`.

### Common status values

| Status         | Meaning                                |
|----------------|----------------------------------------|
| `todo`         | Not yet started                        |
| `in-progress`  | Actively working                       |
| `follow-up`    | Needs follow-up attention              |
| `done`         | Completed                              |
| `cancelled`    | No longer relevant                     |
| `open`         | Created but not yet prioritized        |

### Common priority values

`low`, `normal`, `high`, `critical`

---

## Common operations

### 1. Read a task note

```bash
obsidian read path="task_notes/tasks/<task-name>.md"
```

Or by filename (like a wikilink):

```bash
obsidian read file="<task-name>"
```

### 2. Change task status

```bash
obsidian property:set name=status value="follow-up" path="task_notes/tasks/<task-name>.md"
```

### 3. Change task priority

```bash
obsidian property:set name=priority value="high" path="task_notes/tasks/<task-name>.md"
```

### 4. Capture a new task (with NLP)

```bash
obsidian tasknotes:capture text="Implement retry mechanism for encryption failure" priority=high tags="SSRC,BUG"
```

Common flags:
- `text=<...>` — free-text parsed by NLP (title, details, due dates, tags, etc.)
- `title=<...>` — explicit title (overrides NLP)
- `priority=<low|normal|high|critical>`
- `status=<todo|in-progress|follow-up|done|cancelled|open>`
- `tags=<tag1,tag2>` — comma-separated (overrides NLP-derived tags)
- `due=<YYYY-MM-DD>` — due date
- `scheduled=<YYYY-MM-DD>` — scheduled date
- `contexts=<ctx1,ctx2>` — comma-separated contexts
- `literal` — treat `text` as literal title, skip NLP

### 5. List tasks in the vault

All tasks:
```bash
obsidian tasks format=tsv
```

Tasks in a specific file:
```bash
obsidian tasks path="task_notes/tasks/<task-name>.md" format=json
```

Incomplete tasks:
```bash
obsidian tasks todo
```

### 6. Toggle / mark a task done

By file + line number:
```bash
obsidian task path="task_notes/tasks/<task-name>.md" line=<N> done
```

### 7. Search vault

```bash
obsidian search query="search terms" path="task_notes/tasks"
```

With context lines:
```bash
obsidian search:context query="search terms" path="task_notes/tasks" limit=10
```

### 8. Time tracking

```bash
# Start tracking
obsidian tasknotes:start-time path="task_notes/tasks/<task-name>.md"

# Stop tracking
obsidian tasknotes:stop-time path="task_notes/tasks/<task-name>.md"

# Check active sessions
obsidian tasknotes:time-status
```

### 9. Pomodoro

```bash
# Check status
obsidian tasknotes:pomodoro action=status

# Start a session
obsidian tasknotes:pomodoro action=start path="task_notes/tasks/<task-name>.md"

# Stop / pause / resume
obsidian tasknotes:pomodoro action=stop
obsidian tasknotes:pomodoro action=pause
obsidian tasknotes:pomodoro action=resume

# Breaks
obsidian tasknotes:pomodoro action=short-break
obsidian tasknotes:pomodoro action=long-break
```

### 10. Vault navigation

```bash
# List files in the vault
obsidian files ext=md

# Get backlinks to a note
obsidian backlinks file="<task-name>"

# See outgoing links from a note
obsidian links file="<task-name>"

# Get file info
obsidian file path="task_notes/tasks/<task-name>.md"
```

---

## Notes & conventions

- Always use `path=` for exact paths, `file=` for wikilink-style resolution.
- Quote values with spaces: `name="My Task"`.
- Task file paths are relative to the vault root: `task_notes/tasks/<task-name>.md`.
- Status values are lowercase hyphenated: `in-progress`, `follow-up`.
- The CLI connects to the **running** Obsidian instance. Obsidian must be open.
- After modifying a task, the change is live in the vault immediately.
