# Cross-tab session browser QA (#1345)

On-demand, manual coverage. CI has no NGINX and no browser, so this is not a CI
gate; results are recorded in the pull request.

## Running a recorded run

```bash
frontend/qa/cross-tab-session/run.sh "$(hostname -I | awk '{print $1}')"
```

`run.sh` refuses a `localhost` address, any port, a working tree with any
uncommitted change (tracked or untracked), and less than 3 GB free disk. It then:

1. restores a capture left by an earlier run, and captures the running
   configuration with `stack.sh show`;
2. installs an `EXIT` trap that restores the stack, before anything is changed;
3. builds and starts the stack with `stack.sh qa-up` and refuses unless the
   served `erp-build` equals `HEAD`;
4. runs the cases and workload W1 in
   `mcr.microsoft.com/playwright:v1.63.0-noble`;
5. restores the stack and measures latency with `measure.mjs`;
6. writes `results.json` to the scratch directory (outside the repository).

A recorded run always goes through `run.sh`. `maintain.sh` and a plain
`docker compose build frontend` do not export `VITE_BUILD_SHA`, so their bundle
shows `unknown` and `run.sh` refuses it.

## The two QA values

`stack.sh qa-up` starts the stack with an access-token lifetime of **20 s** and a
refresh grace of **5 s**, so cases 8-11 can observe expiry and rotation. These
are not production values. `run.sh` captures the values that were running before
the run and `stack.sh restore` puts exactly those back.

## The rate-limit script

```bash
nginx/verify-rate-limits.sh && nginx/verify-rate-limits.sh
```

Runs from a container with its own address, so the browser tabs on the host do
not share its rate-limit key. It derives every wait, request count and bound
from the rates and bursts in `nginx/nginx.conf`, and must pass twice in a row.

## Known limits

- Chromium only; Firefox, Safari and mobile are unverified.
- Natural tab freezing and the back/forward cache are not exercised; case 15
  dispatches the events synthetically.
- The latency figures come from one machine (headless Chromium, idle disk).
- The tab capacity of `session_limit` is the number W1 measured, and no more.
- Several users sharing one address are unverified.
