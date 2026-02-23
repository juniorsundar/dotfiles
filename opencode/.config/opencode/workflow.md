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
- Routes the task to Plan, Build, or Executor.
- Requests clarification if the user request is ambiguous.

**Routing Rules**
- Straightforward/Significant implementation → Executor
- Multi-step, ambiguous, or architecture tasks → Planner
- For codebase mapping or dependency tracing -> Explore
- For external research or references -> Deep-Research

---

### 2) Build (Primary)
**Responsibilities**
- Implement changes and modify files.
- Execute tasks and produce deliverables.

**Delegation**
- For codebase mapping or dependency tracing -> Explore
- For external research or references -> Deep-Research
- For multi-step, ambiguous, or architecture tasks → Planner (subagent)

---

### 3) Plan (Primary)
**Responsibilities**
- High-level system design and architectural guidance.
- Decompose tasks and define execution steps.
- Must not modify files or run implementation commands.

**Delegation**
- For codebase mapping or dependency tracing -> Explore
- For external research or references -> Deep-Research
- Lightweight/simple implementation → Executor

## Subagents (Delegation Rules)

Subagents are called only by primary agents when specialized capability is required.
Each subagent must define:

- **Response format** (if required)
- **Tool metadata** (separate from prompt)
- **Clear delegation triggers**

### 2) Planner (Subagent)
**Responsibilities**
- High-level system design and architectural guidance when called by another primary agent.
- Decompose tasks and define execution steps for the Build agent.
- Must not modify files or run implementation commands.

### 3) Executor (Subagent)
**Responsibilities**
- Handle simple, straightforward implementation tasks.
- Execute tasks quickly and efficiently.
- Must not plan or design.

### 4) Explore (Subagent)
**Responsibilities**
- Codebase tracing and dependency mapping.
- Execution flow analysis.

### 5) Deep-Research (Subagent)
**Responsibilities**
- External documentation and logic analysis.
- Solve complex logic issues.

---

## Standard Flow (Summary)

1. **Orchestrator receives request**
2. **Routes to Planner / Executor / Explore / Deep-Research**
3. **Primary agent delegates to subagents if needed**
4. **Primary consolidates results**
5. **Orchestrator returns final response**

---

## Notes
- Direct Build/Executor is allowed for clear implementation tasks.
- Plan is preferred when scope, requirements, or architecture are unclear.
- Build can delegate to Planner (subagent) when mid-task planning is needed without escalating back to the Orchestrator.
