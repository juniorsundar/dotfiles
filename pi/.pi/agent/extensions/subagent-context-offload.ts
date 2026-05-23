import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const POLICY = `## Subagent Context Offloading and Orchestration

Use subagents as both context offloaders and orchestration workers. The main agent stays responsible for intent, planning, review, and final synthesis, but should proactively delegate bounded parts of non-trivial work.

Consider one focused Scout, Explore, Plan, local-worker, reviewer, or worker subagent before you would otherwise:
- run broad repo searches,
- read many files into the main conversation,
- inspect unfamiliar code paths,
- compare existing implementation patterns,
- draft an architecture plan for a non-trivial change,
- apply a repetitive mechanical change,
- run a targeted failure investigation,
- review an implementation or diff.

Default behavior:
- For non-trivial coding, debugging, research, or planning tasks, prefer launching at least one focused subagent before doing broad exploration in the main context.
- Use subagents for orchestration when work naturally separates into scout/research, implementation, review, or verification phases.
- Prefer one background subagent for context offloading; use parallel subagents when tasks are independent and bounded.
- For changes touching multiple files or requiring validation, consider a worker/reviewer or scout/worker/reviewer flow.
- For repetitive mechanical edits or small bounded inspections, prefer local-worker when available.
- Ask subagents for concise results: key findings, critical file paths/symbols, risks, verification results, and recommended next steps.
- Do not paste large code blocks from subagent results into the main conversation.
- Do not spawn subagents for trivial one-line edits, single-file explanations, simple failures, or purely user-facing final answers.
- Treat subagent results as leads; verify critical claims before editing or finalizing.
- In read-only modes, only use read-only subagents such as Scout, Explore, Plan, or review-only workers.

Good subagent prompt shape:
"Inspect <area>. Return at most 8 findings, 10 relevant paths, 3 risks, and 3 recommended next steps. Do not paste large code blocks."

Good orchestration prompt shape:
"Implement/review/verify <bounded scope>. Allowed files/commands: <scope>. Forbidden areas: <constraints>. Return files inspected, files changed, concise summary, verification result, and blockers."`;

export default function subagentContextOffload(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${POLICY}\n`,
  }));
}
