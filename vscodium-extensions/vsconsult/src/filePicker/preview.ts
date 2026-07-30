import type { PickerContext } from "../picker/context.js";
import type { FileCandidate } from "../picker/types.js";

/**
 * Previews a FileCandidate by showing the session-owned virtual preview.
 *
 * Uses the bounded content policy (see ../host/previewContent.ts) so large,
 * binary-looking, and unreadable candidates get a safe, informative fallback
 * instead of loading the full file or emitting corrupted bytes.
 *
 * Like Accept, Preview performs only the effect (update virtual document).
 * The host owns lifecycle.
 */
export async function previewFileCandidate(
  candidate: FileCandidate,
  context: PickerContext,
): Promise<void> {
  const content = await context.readPreviewContent(candidate.id);
  // Only resolve language for normal full previews; binary,
  // truncated, and error content may use plain text (spec / ADR 0004).
  const shouldResolve =
    !content.binary && !content.truncated && !content.error;
  let languageId: string | undefined;
  if (shouldResolve && context.resolveLanguageId) {
    try {
      languageId = await context.resolveLanguageId(candidate.id);
    } catch {
      // Non-fatal: a failing resolver must not break previewing.
      // Fall through — plain text is the safe fallback.
      languageId = undefined;
    }
  }
  await context.showPreview({
    text: previewBody(content),
    title: candidate.relativePath,
    languageId,
  });
}

/**
 * Builds the body displayed in the virtual preview from the structured
 * content result. A truncated excerpt appends the truncation notice; a
 * binary or error result is already self-describing.
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
    // A truncated result always carries a notice; if one is somehow absent,
    // fall back to a generic marker so the excerpt is never mistaken for
    // the complete file.
    const notice = content.truncationNotice ?? "… [truncated]";
    return `${content.text}\n${notice}`;
  }
  return content.text;
}