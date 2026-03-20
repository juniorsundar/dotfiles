# Agentic Workflow (Human-Led Primary)

## Purpose
This document defines the workflow for the human-led primary agent system. Unlike orchestrator-driven systems, Plan and Build agents work directly with humans, asking questions and delegating context gathering to subagents.

---

## Core Principle
**Ask First, Delegate Second**
- Primary agents (Plan, Build) ask clarifying questions before proceeding
- Subagents gather FULL context, then COMPRESS output to ≤5 bullet points
- Primary agents stay under 60% context window at all times

---

## Primary Agents (Human-Led)

### 1) Plan (Primary - Kilo Gateway)
**Responsibilities**
- Work directly with humans on system design and architecture
- Ask clarifying questions to narrow scope before delegating
- Delegate ALL context gathering to subagents (@explore, @deep-research, @planner)
- Synthesize user intent + compressed subagent findings
- Produce execution plans for Build
- Must NOT modify files or explore codebase directly

**Delegation Pattern**
- Ask questions → Wait for answers → Delegate to subagents → Receive compressed findings → Synthesize plan

**Delegation Triggers**
- Codebase structure/dependencies → @explore (with targeted query)
- External docs/library behavior → @deep-research (with specific question)
- Task decomposition for complex sub-components → @planner (with constraints)

---

### 2) Build (Primary - Kilo Gateway)
**Responsibilities**
- Work directly with humans to implement code
- Ask clarifying questions before implementing or delegating
- Delegate ALL exploration and research to subagents
- Read only files listed in plan or directly relevant to current step
- Implement one step at a time with Human-in-the-Loop confirmation
- Must NOT do open-ended exploration or architectural design

**Delegation Pattern**
- Receive plan → Ask questions if ambiguous → Delegate if context needed → Implement with confirmation

**Delegation Triggers**
- Unfamiliar file structure/dependencies → @explore
- API/library clarification → @deep-research
- Ambiguous step sequence → @planner (for sub-problem decomposition)

---

## Subagents (Context Gatherers - GitHub Copilot)

Subagents gather FULL context using their full tool access, then COMPRESS output to essentials before returning to primary agents.

### 1) Planner (Subagent)
**Model**: github-copilot/claude-sonnet-4.6
**Role**: Task decomposition specialist (NOT full architecture - that's Plan's job)
**Called By**: Plan, Build
**Process**:
1. Receive specific sub-problem from primary agent
2. Delegate to @explore or @deep-research if context needed
3. Return ONLY numbered Execution Steps (no Architecture Overview)
**Output Format**:
```
## Execution Steps
1. [Atomic step]
2. [Atomic step]
...

## Context Notes (from subagents)
- [≤5 bullet points]
```

### 2) Executor (Subagent)
**Model**: github-copilot/claude-sonnet-4.6
**Role**: Simple task implementer
**Called By**: Plan (via ROUTE_TO_EXECUTOR flag), Orchestrator
**Complexity Threshold**: ≤3 files, no design decisions, no dependency tracing
**Process**: Implement directly with user confirmation

### 3) Explore (Subagent)
**Model**: github-copilot/gpt-5.4
**Role**: Codebase tracer and dependency mapper
**Called By**: Plan, Build, Planner
**Process**: 
1. Gather FULL context (read everything needed)
2. COMPRESS to ≤5 bullet points per section
**Output Format**:
```
## Files Analyzed
- [≤5 file paths]

## Dependencies
- [≤5 key dependencies]

## Execution Flow
[≤5 bullet points]
```

### 4) Deep-Research (Subagent)
**Model**: github-copilot/gpt-4o
**Role**: External documentation and logic analyzer
**Called By**: Plan, Build, Planner
**Process**:
1. Research external sources using webfetch
2. COMPRESS findings to JSON with ≤5 key_findings
**Output Format**: JSON only
```json
{
  "summary": "string",
  "key_findings": ["≤5 items"],
  "sources": ["URLs"],
  "recommended_action": "string"
}
```

---

## Standard Flow (Human-Led)

### For Complex/Architecture Tasks:
1. **User engages @plan**
2. **Plan asks clarifying questions**
3. **User provides answers**
4. **Plan delegates to subagents** (targeted queries based on answers)
5. **Subagents gather full context, compress output**
6. **Plan synthesizes architecture + compressed findings**
7. **Plan produces execution plan, user confirms**
8. **Plan routes to @build** (or flags ROUTE_TO_EXECUTOR for simple tasks)
9. **Build implements with Human-in-the-Loop confirmation**
10. **Build returns summary**

### For Simple/Bounded Tasks:
1. **User engages @build** directly (≤3 files, clear scope)
2. **Build asks clarifying questions**
3. **Build implements or delegates as needed**
4. **Build returns summary**

---

## Context Compression Rules

All subagents MUST compress findings:
- **Maximum**: ≤5 bullet points per section
- **Maximum**: ≤3 sentences per bullet point
- **Primary agent context window**: Must stay under 60%
- **Purpose**: Subagents do the heavy lifting; primaries stay lean

---

## Notes
- Primary agents ask questions; subagents gather context
- Subagents have full tool access for gathering; primaries have limited tools
- Subagent output is ALWAYS compressed before returning
- Build can call Planner subagent for mid-task decomposition without escalating
- Executor handles trivial tasks that don't need Plan → Build chain
