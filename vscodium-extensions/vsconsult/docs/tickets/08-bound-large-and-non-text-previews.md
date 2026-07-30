# 08 — Bound large and non-text previews

**What to build:** Make the virtual preview safe and informative for large, binary-looking, and unreadable candidates. Ordinary files no larger than 1 MiB remain complete; larger text files use a true bounded read of at most 512 KiB and clearly identify the excerpt as truncated. Content that is unsuitable for text preview receives a useful fallback without ending the picker session.

**Blocked by:** 07 — Prove Ctrl+P history containment.

**Status:** ready-for-agent

- [x] Files up to and including 1 MiB receive a complete textual preview.
- [x] Files larger than 1 MiB read no more than the first 512 KiB and display a clear truncation notice.
- [x] The implementation inspects size before choosing the read strategy and never loads a complete large file merely to truncate it afterward.
- [x] A multibyte UTF-8 character crossing the excerpt boundary is decoded safely.
- [x] Binary-looking content displays metadata and an explanatory fallback rather than corrupted text.
- [x] Stat, read, and decode failures remain non-fatal and leave the picker usable.
- [x] Host-level behavioral tests assert independent byte limits, bounded I/O, UTF-8 output, binary fallback, and recoverable errors.
