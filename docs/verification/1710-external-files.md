# External memory completion record — #1710

## Scope

External changes are in `~/.claude/projects/-home-blur-erp2/memory/`:
`validate-links.py`, new `test_validate_links.py`, 26 note names and their
wikilinks, five top-level types moved under metadata, nine descriptions quoted without changing their text, and
`project_memory_link_hygiene.md`. Filenames and index paths stay unchanged.
Merging this record does not install these files. Python 3 and the local
repository paths referenced by fixtures are required; no extra Python packages.

## Baseline

Snapshot: `/home/blur/erp2/.scratch/1710/external-baseline/`.
2026-11-08T01:24:00+08:00

Created with `cp -a /home/blur/.claude/projects/-home-blur-erp2/memory .scratch/1710/external-baseline`.
`git check-ignore .scratch/1710/external-baseline` exited 0. The snapshot is
preserved locally and is unavailable to repository CI.

## Review

External subject: `diff -ru .scratch/1710/external-baseline /home/blur/.claude/projects/-home-blur-erp2/memory`.
Repository subject: Git changes against `main`. Standards and Spec are reviewed
separately, with detailed reports in the local review ledger `.scratch/1710/reviews.md`.
External evidence establishes local behavior only, not installation on another machine.

## Evidence

- Initial isolated name-mismatch regression: `cd ~/.claude/projects/-home-blur-erp2/memory && python3 -m unittest test_validate_links`
  exited 1 (one failure among two tests), then passed after implementation.
- The validator with checks added exited 1 before migration; Frontmatter problems: 37; FAIL — 37 problem(s). Raw local output is
  `.scratch/1710/live-red.txt`.
- Final suite: the same unittest command exited 0: 5 test methods, including
  16 invalid-frontmatter cases and 11 repository-link cases. Fixtures copy only
  the validator; each checks a separate temporary sentinel remains unchanged.
- Live check: `cd ~/.claude/projects/-home-blur-erp2/memory && python3 validate-links.py`
  exited 0: 0 frontmatter problems, 113 memories, 142 links, 113 index rows.
- Stale-name search: `python3 .scratch/1710/search-stale.py` exited 0, with 0
  unexpected matches. It searches all Markdown text for the 26 old names saved
  before migration in `.scratch/1710/old-names.json`, including wikilink targets.
  The only exceptions are the explicitly historical names
  `frontend-full-test-suite-is-slow-not-hung` and
  `Always create a PR before closing issues` in the hygiene note.
- All 26 name mismatches were corrected. Five top-level types moved into metadata;
  `originSessionId` was preserved under metadata. The feedback type in
  `project_notnull_needs_beforeinsert.md` was retained: prefixes do not constrain type.

Reproducible stale-name search (from the repository root; snapshot required):

```python
from pathlib import Path
import re
live = Path.home() / '.claude/projects/-home-blur-erp2/memory'
baseline = Path('.scratch/1710/external-baseline')
old = []
for p in baseline.glob('*.md'):
    if p.name == 'MEMORY.md': continue
    name = re.search(r'^name: (.*)$', p.read_text(), re.M).group(1)
    if name != p.stem: old.append(name)
assert len(old) == 26
unexpected = []
for p in live.glob('*.md'):
    for line in p.read_text().splitlines():
        for name in old:
            if name in line:
                historical = (p.name == 'project_memory_link_hygiene.md'
                    and name in {'frontend-full-test-suite-is-slow-not-hung',
                                 'Always create a PR before closing issues'})
                if not historical: unexpected.append((p.name, name))
print('Unexpected stale-name matches:', len(unexpected))
assert not unexpected
```

Repository gate: `cd backend && npm run test:scripts` exited 0, 82/82 passed.
The initial run failed the pointer check before new documentation was staged and
a bare external filename was clarified; the final run passed. No application
TypeScript changed, so application typechecks are outside the change-scoped gates.
