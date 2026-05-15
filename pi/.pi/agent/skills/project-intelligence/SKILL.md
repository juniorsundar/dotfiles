---
name: project-intelligence
description: Map an unfamiliar codebase, identify architecture, conventions, commands, entrypoints, dependencies, risks, and a safe implementation strategy. Use before non-trivial changes or when joining a new repository.
---

# Project Intelligence

Use this skill to build a compact mental model of a repository before changing it.

## Workflow

1. Identify repository shape:
   - `pwd`, `ls`, `find . -maxdepth 3 -type f` or `rg --files`
   - package/build files: `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `Makefile`, CI configs
   - context files: `AGENTS.md`, `CLAUDE.md`, `.opencode*`, `.pi`, `.github`

2. Determine commands:
   - test, lint, typecheck, build, format
   - prefer package scripts over guessing raw commands
   - note commands you did not run and why

3. Map architecture:
   - entrypoints and top-level modules
   - core domain types/data flow
   - config/environment assumptions
   - test layout and fixtures

4. Find local conventions:
   - naming/style patterns
   - error handling and logging
   - dependency injection / state management
   - existing examples similar to the requested change

5. Produce a concise report:

```markdown
## Project Map
- Stack:
- Entrypoints:
- Important directories:
- Commands:
- Conventions:
- Risks/unknowns:
- Suggested implementation approach:
```

## Rules

- Prefer `read` over shelling out to `cat` for file contents.
- Read important files completely when feasible.
- Do not modify files while using this skill unless the user explicitly asks to implement.
- Ask one clarifying question if the repo goal or requested change is ambiguous.
