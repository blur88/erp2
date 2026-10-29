# Shared agent skills

Local edits are versioned in the private [blur88/agent-skills](https://github.com/blur88/agent-skills) repository, cloned at `~/agent-skills`, as decided in [issue #1492](https://github.com/blur88/erp2/issues/1492#issuecomment-6441835742).

These nine installed skills link into that clone: `ask-matt`, `code-review`, `domain-modeling`, `implement`, `pr`, `retro`, `to-spec`, `to-tickets`, and `triage`. Claude Code's existing links through `~/.agents/skills` are preserved. Other skills remain managed by their existing installers.

After a skills update or reinstall, restore the protected links with:

```bash
~/agent-skills/bin/link-skills
```

For refusal handling, backups, upstream updates and verification, read the private repository's [README](https://github.com/blur88/agent-skills#readme).

Before editing a skill in `~/agent-skills`, read that repository's `CLAUDE.md`: an agent working from this repository never loads it. It requires re-syncing `docs/<bucket>/<skill>.md` whenever a skill in `engineering/` or `productivity/` is added, renamed or changes behaviour. The docs-sync pre-push hook landed in [agent-skills PR #1](https://github.com/blur88/agent-skills/pull/1). Follow the owning [README's hook setup and enforcement rules](https://github.com/blur88/agent-skills#docs-sync-pre-push-hook) to enable it per clone; until configured, verify the re-sync manually.
