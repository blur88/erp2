# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

A maintainer-authored retro issue can be filed directly as `ready-for-agent` when its scope and acceptance criteria are complete and implementation needs no further owner decision; retro items that still need a decision go in the appropriate pending state (`needs-triage` for maintainer evaluation or `needs-info` for missing reporter information). For example, #1826 had complete scope and acceptance criteria but was filed as `needs-triage`, signalling an unnecessary triage pass.

Edit the "Label in our tracker" column to match whatever vocabulary you actually use.
