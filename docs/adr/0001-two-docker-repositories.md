# Images are published to two Docker Hub repositories: a public Release repository and a private Master repository

Each Release pushes its images to two places. The **Release repository** (`blur88/erp2`, public) gets an immutable set per Release tagged with the GitHub version (`vX.Y.Z-backend`, `vX.Y.Z-frontend`, `vX.Y.Z-nginx`) plus moving `latest-backend`, `latest-frontend`, `latest-nginx` tags, and production pulls the `latest-*` tags from it without credentials. The **Master repository** (`blur88/master`, private) is the owner's own image store shared across their projects; it gets one moving tag per image, prefixed with the project (`erp2-backend`, `erp2-frontend`, `erp2-nginx`), and no version history. This replaces the single `blur88/all` repository, which mixed floating and versioned tags; that repository was deleted and nothing was migrated: both new repositories start empty and fill from the next Release.

## Private tag inspection

Inspect registry tags with `docker buildx imagetools inspect blur88/master:<tag>`. This uses the existing local Docker credentials. The anonymous Docker Hub web API can return 404 even for existing tags in the private Master repository, so an anonymous 404 does not establish absence.

To verify that a target tag is absent:

1. Confirm that a known existing tag in the same private repository, such as `blur88/master:erp2-backend`, resolves with the same credentials: `docker buildx imagetools inspect blur88/master:erp2-backend`.
2. Inspect the target tag and confirm the tag-not-found diagnostic: `ERROR: docker.io/blur88/master:<tag>: not found`.
3. Keep absence **Unverified** after an anonymous 404, an authentication error, or a network error. A failed control lookup also leaves target absence **Unverified**.

Record the control and every target result from the same authenticated session using this compact evidence format. Fill every field; use **Unverified** when evidence is missing.

```text
Checked at: <UTC timestamp>
Authentication: <same authenticated session/credential context; no credential values>
Repository access (if independently checked): <repository; status code or concise diagnostic, otherwise not independently checked>
Known existing control tag: <tag; resolves/status code or concise diagnostic>
Target tags:
- <tag>: <status code or concise diagnostic; conclusion>
```

Keep credentials, authorization headers, and raw response bodies out of the record. Mark superseded authentication failures explicitly when newer authenticated evidence replaces them.

## Consequences

- Production depends on the Release repository staying public: `setup.sh` never runs `docker login`.
- Between the switch and the first subsequent Release, the Release repository has no tags and a production pull fails.
- There is no rollback tooling; the versioned tags in the Release repository are what one would pin to if it is ever needed.
