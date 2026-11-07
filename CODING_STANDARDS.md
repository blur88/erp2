# Coding standards

These rules require judgment across files. Put mechanically enforceable rules in lint, hooks or checks.

- **Steering docs and linked topic docs have one source of truth.** Keep each fact in one authoritative place. Other mentions are pointers naming the subject and when to follow it. When relocating guidance, preserve prerequisites, explicit obligations and meaningful references (including “above/below” targets), and consolidate against existing destination content. Incidents: #1697, #1698, PR #1708.
- **Frontend API tests exercise the backend response shape.** Check the controller, DTO and any response wrapper; return that shape from mocks and type the API call against it. Incident: #1703, fixed in PR #1716.
- **Agent docs hold durable rules.** Put one-off plans, issue-specific actions and closure steps in the issue. Incident: PR #1720, which removed an issue-specific follow-up plan from the development reference.
- **Removing a mechanism includes updating its reasons.** Search comments and docs for explanations that depend on the removed plugin, step or behavior, then update them to explain the current design. Incident: PR #1720: release auto-commit explanations and the development reference’s release-retrigger justification for `--ff-only` survived removal of the version commit.
- **One pinned version has one source.** Declare a dependency used by tests and runtime once, and install both from that declaration. Incident: PR #1720: the changelog preset version appeared in both the root manifest and release workflow.

- **Checker documentation matches its code.** Verify claims about accepted, skipped and rejected inputs against the implementation, including exceptions and resolution order. Incident: #1705, PR #1723: pointer-check documentation omitted accepted and skipped cases.
