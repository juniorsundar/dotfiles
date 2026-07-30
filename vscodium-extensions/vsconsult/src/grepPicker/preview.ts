import type { PickerContext } from "../picker/context.js";
import type { GrepCandidate } from "../picker/types.js";

/**
 * Previews a GrepCandidate by showing the session-owned virtual preview
 * scrolled to the match line.
 *
 * Uses the bounded content policy (see ../host/previewContent.ts) so
 * large, binary-looking, and unreadable candidates get a safe fallback.
 * The reveal position is passed to showPreview so the virtual document
 * scrolls to the match line (ticket 11 capability).
 *
 * Like Accept, Preview performs only the effect. The host owns lifecycle.
 */
export async function previewGrepCandidate(
  candidate: GrepCandidate,
  context: PickerContext,
): Promise<void> {
  const content = await context.readPreviewContent(candidate.absolutePath);

  // Resolve language only for normal full previews.
  const shouldResolve =
    !content.binary && !content.truncated && !content.error;
  let languageId: string | undefined;
  if (shouldResolve && context.resolveLanguageId) {
    try {
      languageId = await context.resolveLanguageId(candidate.absolutePath);
    } catch {
      languageId = undefined;
    }
  }

  await context.showPreview({
    text: previewBody(content),
    title: candidate.relativePath,
    languageId,
    reveal: {
      line: candidate.lineNumber - 1,
      character: candidate.column - 1,
    },
  });
}

/**
 * Builds the body displayed in the virtual preview from the structured
 * content result. Mirrors the file picker's previewBody.
 */
function previewBody(content: {
  text: string;
  truncated: boolean;
  binary: boolean;
  error?: string;
  truncationNotice?: string;
}): string {
  if (content.binary || content.error) return content.text;
  if (content.truncated) {
    if (content.truncationNotice) {
      return content.text + "\n" + content.truncationNotice;
    }
    return content.text + "\n… [truncated]";
  }
  return content.text;
}
