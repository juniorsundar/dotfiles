# Issue tracker: Local markdown

Issues and PRDs for this repo live as markdown files under `docs/tickets/`. There is no GitHub/GitLab issue tracker — work is tracked in-tree.

## Conventions

- **Create an issue**: write a new markdown file under `docs/tickets/` named `NN-slug.md` where `NN` is the next sequential number (scan the directory for the highest existing number and increment by one). Use the ticket format already established in that directory.
- **Read an issue**: read the corresponding `docs/tickets/NN-slug.md` file.
- **List issues**: `ls docs/tickets/` and read the files. Open tickets are those whose checklist is not fully complete; closed/complete tickets are marked as such in their Status line.
- **Comment on an issue**: append a section to the ticket file, or update its checklist/status in place.
- **Apply / remove labels**: this repo does not use label metadata; status is recorded in the ticket file's `Status:` line.
- **Close**: mark the ticket's `Status:` as `complete` (or `wontfix`) and tick the remaining checklist items.

## When a skill says "publish to the issue tracker"

Write a new ticket file under `docs/tickets/` using the existing ticket format (see `docs/tickets/05-host-support-stream-sources.md` for the shape: a `What to build:` summary, `Blocked by:` links, a `Status:` line, and a checklist of criteria).

## When a skill says "fetch the relevant ticket"

Read `docs/tickets/<NN>-<slug>.md`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single index file (or a ticket acting as one) with **child** tickets linked from it. Blocking is expressed via `Blocked by: NN — ...` lines at the top of the child ticket body, matching the convention already used in `docs/tickets/`. A ticket is unblocked when every blocker is marked complete.