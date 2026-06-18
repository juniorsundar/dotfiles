---
name: to-prd
description: Turn the current conversation context into a PRD and publish it to the project issue tracker. Use when user wants to create a PRD from the current context.
---

# To PRD

Use this skill to produce a PRD from the current conversation context and codebase understanding. Do not interview the user — synthesize what you already know.

## When to use

- The user wants a formal PRD written from discussion context
- You have enough context about the codebase and the feature to produce a meaningful document
- The user wants to hand off the PRD to an issue tracker or share it with a team

## Process

1. **Explore the codebase** to understand the current state, if you haven't already. Use `read`, `grep`, `find`, or read-only `bash` commands — or dispatch a `scout` subagent for broader exploration. Read the project's domain glossary (look for `CONTEXT.md` or `context.md` — case-insensitive) and respect any ADRs in the area you're touching.

2. **Sketch out the modules** you will need to build or modify. Actively look for opportunities to extract deep modules — modules that encapsulate a lot of functionality behind a simple, testable interface which rarely changes. Check with the user that these modules match their expectations. Ask which modules they want tests written for.

3. **Write the PRD** using the template below.

4. **Publish the PRD** to the project's issue tracker if one is configured and accessible. Apply a `ready-for-agent` triage label if available. If no issue tracker integration is available, write the PRD to `docs/prd/` or the root of the project as `PRD.md` — ask the user which they prefer.

## PRD Template

### Problem Statement

The problem that the user is facing, from the user's perspective.

### Solution

The solution to the problem, from the user's perspective.

### User Stories

A long, numbered list of user stories. Each user story should be in the format:

> As an \<actor\>, I want a \<feature\>, so that \<benefit\>

Example:
> As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending

This list should be extremely extensive and cover all aspects of the feature.

### Implementation Decisions

A list of implementation decisions. Include:

- The modules that will be built or modified
- The interfaces of those modules
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do not include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

### Testing Decisions

A list of testing decisions. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

### Out of Scope

A description of the things that are out of scope for this PRD.

### Further Notes

Any further notes about the feature.

## Rules

- Synthesize from existing context. Do not interview the user — use what you already know.
- Explore the codebase before writing the PRD. Use `read`, `grep`, `find`, or read-only `bash` — or dispatch a `scout` subagent for broader exploration.
- Use the project's domain glossary vocabulary from `CONTEXT.md` throughout the PRD. When searching for the glossary, look for both `CONTEXT.md` and `context.md` (case-insensitive).
- Respect any ADRs in the area you're touching.
- User stories must be extremely extensive — cover all aspects of the feature.
- Do not include file paths or code snippets in the PRD (except for prototype snippets that encode decisions precisely).
- If no issue tracker integration is available, ask the user where to write the PRD file.
- Use `read` over shelling out to `cat` for file contents.
