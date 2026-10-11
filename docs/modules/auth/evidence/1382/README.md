# Evidence for PR #1382 (#1367, #1378, #1379), 2026-10-11

The records `docs/modules/auth/SESSION_QA.md` cites for its three sections of
2026-10-11. They were written on the QA host by `run.sh` and copied here
unchanged, except that each ingress log is gzip-compressed and the override
copies of the suite are kept as diffs, not as whole copies.

**Every run here is a partial run** (`QA_SUITE_OVERRIDE`, `QA_ONLY`, or both).
None is a recorded run and none is evidence of a pass of the suite. Each
`results.json` says so in its `partial` field.

## Limitations that stay with this evidence

- **The session ending of #1378 was observed once** (`1378/original-run-W1-429`).
  T1 did not reproduce it. Its cause is read from that one run's records and
  the server's rows, not from a second occurrence.
- **That the channel message's handler is what redirects tab B is inferred**
  in cases 1 and 3 (#1379): the message is observed arriving first and nothing
  else was due. The handler's effect is not observed directly.
- The no-request line of cases 1 and 3 has not been seen to fail on a request
  the application sent (#1363).
- No whole recorded run has entered case 8's extension (#1367); E8 placed the
  uses through the harness.

## Layout

```
<issue>/EXPECTATIONS.md          what was expected, written before the runs; dated additions, nothing rewritten
<issue>/COMMIT-of-the-base-copy  the commit the override copies were taken from
<issue>/mutations/<copy>.diff    each override copy, as a diff against the suite it was copied from
<issue>/runs/<run>/meta.txt      copy, selection, commit, start and end, exit status
<issue>/runs/<run>/run.log       run.sh's output
<issue>/runs/<run>/results.json  the suite's results: checks, records, stack configuration, `partial`
<issue>/runs/<run>/stack-*.json  the stack's configuration before, during, after, and read again after exit
<issue>/runs/<run>/ingress-access.log.gz   the ingress log of the run (format `limits`)
```

| Directory | Runs | Section of SESSION_QA.md |
|---|---|---|
| `1378/original-run-W1-429` | W1 run 1 of #1363 on `5102cbaff`, where the ending was seen; `server-rows.txt` is that session in `auth_sessions` and `refresh_tokens` | "The session that ended after refused refreshes" |
| `1378/runs` | T1 (`794d2e321`), T2 (`761985e1c`, the fix) | the same |
| `1379/runs` | N, PA, PB1, PB3 (`794d2e321`), R13 (`7096dc604`, the repository's suite) | "Cases 1 and 3 after the assessment" |
| `1367/runs` | G8, E8, B8, B8b, U8 (`794d2e321`); R8, PB8, PU8 (`26f864584`) | "Case 8 through its extension and at its bound" |

`proposed.diff` under `1379/mutations` and `1367/mutations` is the change this
PR makes to `cases/signout.mjs` and `cases/refresh.mjs`; the `p-*` diffs are
against it.

## Reading the main claims back

The refreshes of the original run's five-tab round, per request identifier
(18 refused, `app-169` answered 200, and `app-185` answered 401 at the end):

```bash
zcat 1378/original-run-W1-429/ingress-access.log.gz | sed -n '/mark-b-5-in/,/mark-c-5/p' | grep -v fill-1363 | grep 'auth/refresh' \
  | sed -E 's/.*\] "([A-Z]+ [^ ]+) [^"]*" ([0-9]{3}) .*msec=([0-9.]+).*lreq=([A-Z-]+).*qa="([^"]+)"/\3 \2 \4 \5/'
```

Which tab sent each refused one (four tabs four each, `N5b-3` two):
`jq '.w1.recorded.forced1363Session429' 1378/original-run-W1-429/results.json`

T1 and T2, logged refreshes against each tab's runtime trace:

```bash
jq '.w1.recorded["trace1378-after-load"] | {logged: (.sessionRequests | group_by(.tab) | map({tab: .[0].tab, n: length, presented: (map(.presented) | unique)})), traced: (.traces | map({tab, sent: ([.trace[] | select(.type == "refresh-sent")] | length)}))}' 1378/runs/T1/results.json
```

Cases 1 and 3, the two new lines of a run:
`jq '.cases[] | {id, pass, lines: [.checks[] | select(.label | test("channel|poll was")) | {ok, detail}]}' 1379/runs/PB1/results.json`

Case 8: `jq '.cases[0] | {pass, error, recorded: (.recorded | {lifetimesUsed, uses, stopped, failedUse, generations, refreshRequests, placement1367})}' 1367/runs/E8/results.json`

## What these files contain, and what was redacted

Request methods, paths, statuses and times, generations, and the suite's
checks and records. Four kinds of value were replaced after the runs, each by
a placeholder that is **the same for the same value in every file**, so a
value can still be followed from one record to another:

| Placeholder | Was |
|---|---|
| `<qa-user-1>` … `<qa-user-3>` | the QA users' names (the two users of the cases, and W1's) |
| `<session-1>` … `<session-9>` | session ids; `<uuid-1>` is the one other id (a user id inside a draft key) |
| `<fp-1>` … `<fp-27>` | the 12-character fingerprints of access and refresh tokens |
| `<qa-host>` | the QA host's LAN address |

Nothing else was changed: the ingress logs were decompressed, replaced and
compressed again, and every `results.json` still parses. The placeholders are
numbered in order of first appearance across the files in path order and mean
nothing else. Docker's bridge address (`172.18.0.1`), which is the client
address the ingress saw, is left as it is.

No password and no token was ever in these files: the directories were
searched for the QA passwords and for anything shaped like a JWT before they
were copied. **The unredacted values were in this branch for one commit**
(`3ed7d8e6f`) and remain in its history.
