# ERP2

The shared language of this repository: the ERP business domain and the engineering workflow that changes it.

## Language

### Review workflow

**Fresh reviewer context**:
A reviewer execution that starts without any of the implementer's conversation, reasoning or session history, working from a self-contained factual brief, prior review reports and repository evidence. Which reviews require one is set by #1729 (R8, R17).

**Forked reviewer context**:
A reviewer execution that inherits any part of the implementer's conversation or session history, whatever its session ID or model.
_Avoid_: forked subagent, inherited-history reviewer

**Authoritative criteria source**:
The GitHub-visible place that holds a change's acceptance criteria: the linked issue body or, when there is no issue, a draft PR body written before the criteria-based review. Its rules are set by #1729 (R21).
_Avoid_: scope file, local criteria
