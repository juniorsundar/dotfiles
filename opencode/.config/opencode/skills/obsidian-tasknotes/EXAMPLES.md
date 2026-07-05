# Workflow Examples

Concrete end-to-end scenarios. Commands shown with typical output/response.

---

## Example 1: Capture a Bug Report and Start Work

**User**: "Capture a high-priority bug about the login redirect failing, and mark it in-progress"

```bash
obsidian tasknotes:capture text="Login redirect fails after SSO auth" priority=high tags="BUG,login" status=in-progress
```

Task is created in `task_notes/tasks/login-redirect-fails-after-sso-auth.md`.
The agent reads it back to confirm:

```bash
obsidian read file="login-redirect-fails-after-sso-auth"
```

**Response to user**:
Created task [[login-redirect-fails-after-sso-auth]] (high priority, in-progress).

---

## Example 2: Daily Review of Pending Tasks

**User**: "What do I need to do today?"

```bash
obsidian tasks todo
```

Output is TSV. The agent reads each task file for frontmatter context
(scheduled dates, priority), then summarizes.

If a task mentions an unknown reference, the agent looks it up:

```bash
obsidian search text="unknown-reference"
```

**Response to user**:

| Task | Priority | Status |
|---|---|---|
| [[fix-login-redirect]] | high | in-progress |
| [[write-api-docs]] | normal | todo |

---

## Example 3: Pomodoro Session with Time Tracking

**User**: "I'm going to do a focused 25-minute session on the login bug"

```bash
# Start Pomodoro
obsidian tasknotes:pomodoro duration-minutes=25

# Start time tracking on the task
obsidian tasknotes:start-time path="task_notes/tasks/fix-login-redirect.md"
```

When user returns after session ends:

```bash
# Stop time tracking
obsidian tasknotes:stop-time path="task_notes/tasks/fix-login-redirect.md"

# Mark task as follow-up if not finished
obsidian property:set name=status value="follow-up" path="task_notes/tasks/fix-login-redirect.md"

# Check if any other tasks need attention
obsidian tasks todo
```

**Response to user**:
Logged 25min on [[fix-login-redirect]], moved to follow-up.
Remaining tasks: [[write-api-docs]] (normal, todo).
