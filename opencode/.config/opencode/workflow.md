# Agentic Workflow (Standard)

## Purpose
This document defines the standard workflow for agent orchestration in opencode. It clarifies routing rules, delegation responsibilities, and how primary and subagents interact.

---

## Core Principle
The **Orchestrator** is explicit and always the entry point.
It routes tasks to a **Primary Agent** and ensures subagent delegation is used appropriately.

---

## Primary Agents

### 1) Orchestrator (Primary)
**Responsibilities**
- First responder to all requests.
- Routes the task to Plan, Build, or Architect.
- Requests clarification if the user request is ambiguous.

**Routing Rules**
- **Straightforward implementation** → Build
- **Multi-step or ambiguous tasks** → Plan
- **Large-scale system design** → Architect

---

### 2) Plan (Primary)
**Responsibilities**
- Decompose tasks and define execution steps.
- Must not modify files or run implementation commands.

**Delegation**
- **Explore** for codebase mapping or dependency tracing.
- **Deep‑Research** for external research or references.
- **Architect** for system design input.

---

### 3) Build (Primary)
**Responsibilities**
- Implement changes and modify files.
- Execute tasks and produce deliverables.

**Delegation**
- **Quality‑Check** for tests and coverage.
- **Safety‑Check** for security / risk review.
- **Refactor** for structure / readability improvements.
- **Document** for docs or comments.
- **DevOps** for infra / CI / container tasks.

---

### 4) Architect (Primary)
**Responsibilities**
- High-level system design and architectural guidance.
- Must not implement code directly.

**Delegation**
- **Deep‑Research** for best practices or external references.
- **Explore** for dependency mapping or execution flow.

---

## Subagents (Delegation Rules)

Subagents are called only by primary agents when specialized capability is required.
Each subagent must define:

- **Response format** (if required)
- **Tool metadata** (separate from prompt)
- **Clear delegation triggers**

Examples:
- **Explore** → codebase tracing and dependency mapping
- **Deep‑Research** → external documentation and logic analysis
- **Safety‑Check** → security or stability review
- **Quality‑Check** → tests and validation
- **Refactor** → cleanup or structure improvement
- **Document** → docs or comments
- **DevOps** → infra, CI/CD, containers

---

## Standard Flow (Summary)

1. **Orchestrator receives request**
2. **Routes to Plan / Build / Architect**
3. **Primary agent delegates to subagents if needed**
4. **Primary consolidates results**
5. **Orchestrator returns final response**

---

## Notes
- Direct Build is allowed for clear implementation tasks.
- Plan is preferred when scope or requirements are unclear.
- Architect is used for major system design decisions.
