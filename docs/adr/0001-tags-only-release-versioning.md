---
status: accepted
---

# Tags-only release versioning

Releases are versioned by Git tag alone. semantic-release creates the tag and a matching GitHub release, and release builds take their version from that tag. Nothing is committed back to `main`. We chose this so `main` stays PR-only with no bypass for the release bot: the `main protection` ruleset rejects direct pushes (GH013), and a version commit is a direct push. We decided this in [#1818](https://github.com/blur88/erp2/issues/1818).

## Versions in builds

- **Release builds:** the three versioned image tags (`erp-backend-v<version>`, `erp-frontend-v<version>`, `erp-nginx-v<version>`) use the version semantic-release calculates. The three moving tags keep their existing names (`erp-backend`, `erp-frontend`, `erp-nginx`) and point to the same digests as their versioned tags. The frontend sidebar shows the same version: the release workflow passes it into the frontend build through `VITE_APP_VERSION`, which becomes Vite's `__APP_VERSION__`.
- **Local builds:** the `backend` and `frontend` manifests and lockfile roots read `0.0.0-dev`, and the sidebar falls back to that when no version is passed in. The manifest `version` field is not the release version, and release automation never changes it.

## One-time reset to the `v3.17.0` baseline

On 2026-11-10 `main` was intentionally rolled back to the `chore(release): 3.17.0` commit. That left the 23 tags `v3.17.1`–`v3.24.2` on commits that are not on `main`, and their GitHub releases were deliberately deleted. We keep `v3.17.0` as the baseline and remove those 23 tags, so semantic-release calculates the next version from `main`'s own history. That version is expected to be `v3.18.0`, pending a dry run.

This reuses version numbers that were published before. We accepted that once so that numbering continues from the code actually on `main`. From the reset on, each published version identifies exactly one build. Before the tags are removed, any Docker images published under those versions are recorded by digest in #1818.

## Considered options

- **Version commits with a release-bot bypass of the ruleset.** Rejected because it reopens direct pushes to `main`. The only thing that read the manifest version, the sidebar label, can get the version from the build instead.
- **Keep the 23 orphaned tags and release above `v3.24.2`.** Rejected in favour of numbering that follows the history on `main`.
