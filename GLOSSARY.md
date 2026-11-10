# ERP2

The shared language of this repository. The ERP business domain and the engineering workflow that changes it.

## Language

### Review workflow

**Fresh reviewer context**:
A reviewer execution that starts without any of the implementer's conversation, reasoning or session history, working only from a self-contained factual brief, prior review reports and repository evidence. Only a fresh reviewer context counts as independent.
_Avoid_: separate session, new session, different model

**Forked reviewer context**:
A reviewer execution that inherits any part of the implementer's conversation or session history. It never satisfies an independent-review requirement, whatever its session ID or model.
_Avoid_: subagent review, independent fork

**Authoritative criteria source**:
The single GitHub-visible place that holds a change's acceptance criteria: the linked issue body, or the PR body when no issue exists. Local copies mirror it and never replace it.
_Avoid_: scope file, spec, local criteria
