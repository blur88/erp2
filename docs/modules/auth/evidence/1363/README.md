# Evidence for the recorded run on `547daacba` (#1363), 2026-10-11

The records `docs/modules/auth/SESSION_QA.md` cites in "Recorded run on
`547daacba`". They were written on the QA host by `run.sh` and by the script
that invoked it, and copied here unchanged except for the redactions below and
the gzip compression of the two ingress logs.

**`run/` is a full recorded run**: the repository's suite at HEAD, served build
equal to HEAD, no `QA_SUITE_OVERRIDE`, no `QA_ONLY`. Its `results.json` has
`partial: false`, `completed: true` and `exitStatus: 0`.

**`interrupted-attempt/` is not a run.** It was terminated while the frontend
image was being built, before any case. It has no `results.json`; its exit
status and end time were not captured, and what terminated it is not
established. It is evidence of the interruption and of the restore that
followed, and of nothing about a case.

## Limitations that stay with this evidence

- The no-request line of cases 1 and 3 has not been seen to fail on a request
  the application sent.
- This run did not enter case 8's extension (`lifetimesUsed` 3.5); no whole
  recorded run has.
- The session ending of #1378 was observed once and not reproduced.
- That the channel message's handler is what redirects tab B is inferred.
- W1's forced failures are not here: they are the partial runs of
  2026-10-11 on `5102cbaff`, described in `SESSION_QA.md` and kept outside the
  repository.

## Layout

```
run/meta.txt                      suite, selection, override, commit, start and end, exit status, load, free disk
run/run.log                       run.sh's output
run/results.json                  the suite's results: cases, W1, latency, capture segments, stack configuration
run/stack-show-before.json        `stack.sh show` before run.sh was started
run/stack-before.recorded.json    the configuration run.sh captured
run/stack-during.json             the configuration during the cases
run/stack-after.json              the configuration after the restore
run/stack-show-after-exit.json    `stack.sh show` after run.sh had exited
run/docker-ps-before-latency.txt  the containers on the host before the latency measurement
run/ingress-access.log.gz         the ingress access log of the run (format `limits`)
run/ingress-error.log.gz          the ingress error log of the run
interrupted-attempt/meta.txt      the start line only; no end line was written
interrupted-attempt/run.log       run.sh's output up to the termination and the restore
```

## Reading the main claims back

```bash
jq '{commit, servedBuild, servedFrom, partial, completed, aborted, exitStatus, stackRestored, restoreFailure}' run/results.json
jq '.cases[] | select(.id == 1 or .id == 3) | {id, pass, lines: [.checks[] | select(.label | test("channel|poll was|no request")) | {label, ok, detail}]}' run/results.json
jq '.cases[] | select(.id == 8) | {pass, recorded: (.recorded | {lifetimesUsed, uses, stopped, failedUse, generations})}' run/results.json
jq '[.w1.checks[] | .ok] | {checks: length, failed: (map(select(. == false)) | length)}' run/results.json
```

## What was redacted

The same four kinds of value as in `evidence/1382`, each replaced by a
placeholder that is the same for the same value in every file here. The
numbering is this directory's own and does not match that one's.

| Placeholder | Was |
|---|---|
| `<qa-user-1>` … `<qa-user-3>` | the QA users' names |
| `<session-1>` … `<session-9>` | session ids |
| `<fp-1>` … `<fp-25>` | the 12-character fingerprints of access and refresh tokens |
| `<qa-host>` | the QA host's LAN address |

Nothing else was changed, and every JSON file still parses. Docker's bridge
address (`172.18.0.1`) is left as it is. The redacted files were searched for
the QA passwords and user names, for anything shaped like a JWT, for a UUID,
for the LAN address, and for authorization and cookie headers: none was found.
The unredacted files were never committed.

`results-cases.json` and `results-latency.json` are not copied: `results.json`
holds both.
