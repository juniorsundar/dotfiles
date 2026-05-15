---
name: commit-pr-assistant
description: Prepare clean commits, commit messages, pull request descriptions, changelogs, and reviewer notes from git diffs. Use when the user asks to commit, summarize changes, open a PR, or prepare review material.
---

# Commit / PR Assistant

Use this skill for commit hygiene and PR preparation.

## Inspect

Run read-only git commands first:

```bash
git status --short
git diff --stat
git diff
git diff --cached
```

If the diff is large, inspect by file:

```bash
git diff -- path/to/file
```

## Commit Message

Write messages in this shape unless the repo uses another convention:

```text
<type>(optional-scope): concise imperative summary

- What changed
- Why it changed
- Any migration/testing notes
```

Common types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `build`, `ci`.

## PR Description

Use:

```markdown
## Summary
- ...

## Testing
- [x] command run / result
- [ ] not run: reason

## Risk
- ...

## Reviewer Notes
- Files/areas worth extra attention
```

## Split Commits

When changes are mixed, suggest logical commit groups by file and purpose. Do not stage or commit unless the user explicitly asks.

## Rules

- Never invent tests. Say "not run" when not run.
- Mention generated files or lockfile changes.
- Highlight risky changes, migrations, or behavior changes.
- Keep summaries concise and reviewer-oriented.
