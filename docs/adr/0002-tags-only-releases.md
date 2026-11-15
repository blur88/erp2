# Releases are tags-only: the version lives in the git tag, never in a commit to `main`

semantic-release works out each Release's version from the commits, then creates the `vX.Y.Z` git tag and the GitHub release. It never commits to `main`. The tag is the only record of a published version. Both `package.json` files and their lockfiles stay at `0.0.0-development`. The release workflow passes the version to the frontend image build as `VITE_APP_VERSION`, which is what the sidebar shows, and the same version tags all three images (see ADR-0001). Builds without that argument, such as local dev or a plain `docker compose build`, show `0.0.0-development`. Releases authenticate with the workflow's built-in `GITHUB_TOKEN`. There is no personal access token, and nothing bypasses the `main` ruleset. A semantic-release failure fails the workflow. A run that finds nothing to release still passes.

We decided this after #1895. The old flow pushed a `chore(release): X.Y.Z [skip ci]` version commit straight to `main`. That needed an admin token whose ruleset bypass covered direct pushes. When the bypass was narrowed to `pull_request` on 2026-11-07, the next release was rejected, and the workflow still reported success.

## Considered Options

- **Admin bypass back to `always`**: rejected. Admins could push straight to `main` again, which is exactly what the ruleset change was meant to stop.
- **GitHub App as an `always` bypass actor**: rejected. It's the narrowest exception, but it adds an app, a private key and a token-minting step that exist only to commit a version number.
- **Deploy key as a bypass actor**: rejected. The key never expires, the bypass applies to every write deploy key on the repo, and pushes would have to go over SSH.
- **Keep committing versions to `main` by any of the routes above**: rejected. A version number in `main`'s history isn't worth a standing exception to "every change to `main` comes through a pull request".

## Consequences

- `package.json` doesn't tell you what version is deployed. Read the tag, the image tag, or the version shown in the app.
- Removing the version commits also made the redundant-trigger guard in `release.yml` and the `git pull --ff-only` advice for `main` obsolete, so both were deleted. The `chore(release)` no-release rule stays, because the old release commits are still in history.
