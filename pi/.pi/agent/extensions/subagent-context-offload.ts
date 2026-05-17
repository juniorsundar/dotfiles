import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const POLICY = `## Subagent Context Offloading

Use subagents as context offloaders, not as a default orchestration mechanism.

Consider one focused Scout, Explore, or Plan subagent before you would otherwise:
- run broad repo searches,
- read many files into the main conversation,
- inspect unfamiliar code paths,
- compare existing implementation patterns,
- draft an architecture plan for a non-trivial change.

Default behavior:
- Prefer one background subagent over many.
- Ask the subagent for a concise result: key findings, critical file paths/symbols, risks, and recommended next steps.
- Do not paste large code blocks from subagent results into the main conversation.
- Do not spawn subagents for small edits, single-file explanations, simple failures, or user-facing final answers.
- Treat subagent results as leads; verify critical claims before editing.
- In read-only modes, only use read-only subagents such as Scout, Explore, or Plan.

Good subagent prompt shape:
"Inspect <area>. Return at most 8 findings, 10 relevant paths, 3 risks, and 3 recommended next steps. Do not paste large code blocks."`;

export default function subagentContextOffload(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${POLICY}\n`,
  }));
}
