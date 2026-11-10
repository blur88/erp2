---
status: accepted
---

# Sign out revokes access tokens by a per-user token version

Signing out deleted the user's refresh tokens but left issued access tokens usable until they expired (15 minutes by default), because the JWT strategy checked only the user's active and locked state ([#1545](https://github.com/blur88/erp2/issues/1545)). We decided that each user carries a token version, that every access token states the version it was issued under, and that an access token whose version is missing, malformed or out of date is rejected. [Sign out](../../GLOSSARY.md#authentication) and password change increment the version. This fits Sign out's scope, which ends every Session of the user at once, and needs no store beyond the `users` row the strategy already reads on every request.

Implemented in [AuthService](../../backend/src/modules/auth/auth.service.ts) and [JwtStrategy](../../backend/src/modules/auth/strategies/jwt.strategy.ts), with the database column added by migration.

## Considered options

- **Token version (chosen).** One integer per user, one claim, one comparison against a row that is already loaded.
- **Server sessions** with a session id in each token. This would allow ending one Session alone, which #1545 leaves out of scope; it adds a table and a lookup per request.
- **A denylist of token ids**, kept until each token expires. It adds a table and its cleanup, and buys nothing over a version while Sign out always covers every Session.

Redis was not an option for any of these: it is the BullMQ store only and holds no cache or session keys (see `AGENTS.md`).

## Consequences

- **Every Session ends together.** Ending one Session alone needs a different mechanism and a new decision.
- **Deactivation and lockout do not touch the version.** They stay live checks on every request and at refresh. Reactivating or unlocking a user therefore makes their unexpired tokens usable again, unless a Sign out or password change incremented the version in between. Likewise a refresh token kept while the user was locked works after unlocking only if it is still unexpired and unrevoked.
- **Deploying the change rejects every access token issued before it**, since those carry no version. Refresh tokens that are still valid can obtain versioned replacements, so users are not all forced to sign in again.
- **The version only increases, by an atomic SQL increment.** An ordinary entity save writes back every column whose loaded value differs from the database row, so a stale save could restore an older version and silently undo a Sign out; the column is therefore excluded from ORM updates.
- **Issuing and revoking serialize on the user row.** Login's token issuance, refresh, Sign out and password change each run in one transaction that first locks the user row `FOR NO KEY UPDATE`, then touches that user's refresh tokens. Password hashing and verification stay outside the transaction. Without this, a refresh racing a Sign out could store a refresh token that survives it, and a login verified against a password changed meanwhile could open a new Session. `FOR NO KEY UPDATE` rather than `FOR UPDATE`, so foreign-key inserts that reference the user are not blocked. Sign out does not require the user to be eligible: an inactive or locked user can still be signed out.
- **Password change is atomic.** The new password, the version increment and the refresh-token deletion commit together or not at all.
