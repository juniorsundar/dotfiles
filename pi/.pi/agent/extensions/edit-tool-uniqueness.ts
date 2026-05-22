import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

type EditInput = {
  path?: string;
  edits?: Array<{ oldText?: string; newText?: string }>;
};

const EDIT_TOOL_GUIDANCE = `
## Edit tool reliability rules

When using the edit tool:
- Every edits[].oldText must match exactly one unique, non-overlapping region in the original file.
- Before editing, prefer reading or searching enough context to make each oldText unique.
- If a target snippet is generic, include a nearby function/class header, distinctive surrounding lines, or both.
- Keep oldText as small as possible while still unique; do not pad with large unrelated blocks.
- If two edits touch the same block or nearby lines, merge them into one edit entry.
- Remember that all edits[].oldText values are matched against the original file, not incrementally after earlier replacements.
`;

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    index = haystack.indexOf(needle, index);
    if (index === -1) return count;
    count += 1;
    index += Math.max(needle.length, 1);
  }
}

function lineNumberAtOffset(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function occurrenceLines(haystack: string, needle: string): number[] {
  const lines: number[] = [];
  if (!needle) return lines;
  let index = 0;
  while (true) {
    index = haystack.indexOf(needle, index);
    if (index === -1) return lines;
    lines.push(lineNumberAtOffset(haystack, index));
    index += Math.max(needle.length, 1);
  }
}

export default function editToolUniquenessExtension(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${EDIT_TOOL_GUIDANCE}`,
  }));

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType<"edit", EditInput>("edit", event)) return;

    const filePath = event.input.path;
    const edits = event.input.edits ?? [];
    if (!filePath || edits.length === 0) return;

    const absolutePath = isAbsolute(filePath) ? filePath : resolve(ctx.cwd, filePath);
    if (!existsSync(absolutePath)) return;

    const content = readFileSync(absolutePath, "utf8");
    const duplicateProblems: string[] = [];
    const missingProblems: string[] = [];

    edits.forEach((edit, index) => {
      const oldText = edit.oldText ?? "";
      const occurrences = countOccurrences(content, oldText);
      if (occurrences === 0) {
        missingProblems.push(`edits[${index}] matches 0 occurrences`);
      } else if (occurrences > 1) {
        const lines = occurrenceLines(content, oldText).slice(0, 8).join(", ");
        duplicateProblems.push(
          `edits[${index}] matches ${occurrences} occurrences${lines ? ` near lines ${lines}` : ""}`,
        );
      }
    });

    if (duplicateProblems.length === 0 && missingProblems.length === 0) return;

    return {
      block: true,
      reason: [
        `Edit preflight failed for ${filePath}.`,
        ...duplicateProblems,
        ...missingProblems,
        "Retry by reading the relevant function/block and adding distinctive surrounding context to oldText. Merge nearby edits into one replacement.",
      ].join("\n"),
    };
  });
}
