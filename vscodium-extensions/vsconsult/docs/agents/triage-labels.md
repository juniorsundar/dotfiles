# Triage Labels

This repo uses a local-markdown issue tracker (`docs/tickets/`). It does not use tracker labels; ticket state is recorded in each ticket file's `Status:` line.

The five canonical triage roles map to ticket-file status values as follows:

| Label in mattpocock/skills | Ticket-file status | Meaning                                  |
| -------------------------- | ------------------ | ---------------------------------------- |
| `needs-triage`             | `needs-triage`     | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`       | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`  | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`  | Requires human implementation             |
| `wontfix`                  | `wontfix`          | Will not be actioned                      |

When a skill mentions a triage role (e.g. "apply the AFK-ready triage label"), set the corresponding `Status:` value in the ticket file instead of applying a tracker label.