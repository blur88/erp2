# Account lockout clock

**Account lockout clock:** Lockout expiry (`User.isLocked`, the login check in `auth.service.ts`, and the `isLocked` filter/count in `users.service.ts`) is evaluated against the **Node container clock** (`new Date()`), never SQL `NOW()`. This keeps login and the user list using one clock so a skewed Postgres container clock can't disagree (issue #710). Docker container clocks can drift after host sleep/resume or container start; if a lockout seems wrong, run `docker compose restart backend` (or resync the host clock). Do not change these comparisons to SQL `NOW()`.
