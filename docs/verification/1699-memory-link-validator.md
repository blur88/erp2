# Memory link validator verification — issue #1699

Verified on 2026-11-06 for [issue #1699](https://github.com/blur88/erp2/issues/1699).

## Scope

The implementation and memory cleanup live outside Git, in
`~/.claude/projects/-home-blur-erp2/memory/`. This document records their
verification; merging it does not install or distribute the external changes.

The external `validate-links.py` now validates absolute repository links and
backtick paths starting with `backend/`, `frontend/`, `docs/`, or `scripts/`.
It removes anchors, Markdown destination delimiters, prose punctuation, and
line/column suffixes before checking existence. It skips star globs and
placeholder paths and supports an exact-path allowlist with reasons.

The cleanup marks references to unavailable memories and the former frontend
testing document as unavailable. Historical or intentionally absent repository
paths have explicit allowlist entries.

## Evidence

Before cleanup, validation exited 1 with 12 missing repository path references
and 14 broken memory links. The final directory exits 0:

```text
OK — 113 memories, 143 links, 113 index rows; all resolve, no duplicates
```

The following command copies only the validator into a temporary fixture
directory, plants missing links, and checks normalization and exclusions.
It then validates the actual memory directory. It leaves the original files
unchanged. All nine fixture checks and the current-directory check passed.

```bash
python3 - <<'PY'
from pathlib import Path
import shutil
import subprocess
import tempfile

source = Path.home() / '.claude/projects/-home-blur-erp2/memory/validate-links.py'
cases = [
    ('missing angle link', '[missing](</home/blur/erp2/docs/__1699_missing__.md>)', 1),
    ('punctuated line', '/home/blur/erp2/README.md:42.', 0),
    ('missing relative', '`docs/__1699_missing__.md:42`', 1),
    ('existing angle anchor', '[exists](</home/blur/erp2/README.md#heading>)', 0),
    ('existing column', '`backend/package.json:42:3`', 0),
    ('glob', '`docs/__1699_missing__/*.md`', 0),
    ('relative placeholder', '`docs/<topic>/file.md`', 0),
    ('absolute placeholder', '[placeholder](/home/blur/erp2/docs/<topic>/file.md)', 0),
    ('allowlist', '`frontend/e2e/`', 0),
]
with tempfile.TemporaryDirectory(prefix='review1699-') as temporary:
    fixture = Path(temporary)
    shutil.copy(source, fixture / 'validate-links.py')
    (fixture / 'MEMORY.md').write_text('[probe](probe.md)\n')
    for label, body, expected in cases:
        (fixture / 'probe.md').write_text('---\nname: probe\n---\n' + body + '\n')
        result = subprocess.run(
            ['python3', 'validate-links.py'], cwd=fixture,
            text=True, capture_output=True,
        )
        print(f'{label}: exit {result.returncode}, expected {expected}')
        assert result.returncode == expected, result.stdout + result.stderr
result = subprocess.run(['python3', 'validate-links.py'], cwd=source.parent)
assert result.returncode == 0
PY
```

## Review and limits

The final standards and specification review reported no remaining findings.
This is local verification, not a CI check: the external memory directory and
validator are not available in a fresh checkout. No application code, database,
or environment configuration changed. Backend and frontend checks do not apply
to this documentation-only repository change.
