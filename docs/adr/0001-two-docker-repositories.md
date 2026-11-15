# Images are published to two Docker Hub repositories: a public Release repository and a private Master repository

Each Release pushes its images to two places. The **Release repository** (`blur88/erp2`, public) gets an immutable set per Release tagged with the GitHub version (`vX.Y.Z-backend`, `vX.Y.Z-frontend`, `vX.Y.Z-nginx`) plus moving `latest-backend`, `latest-frontend`, `latest-nginx` tags, and production pulls the `latest-*` tags from it without credentials. The **Master repository** (`blur88/master`, private) is the owner's own image store shared across their projects; it gets one moving tag per image, prefixed with the project (`erp2-backend`, `erp2-frontend`, `erp2-nginx`), and no version history. This replaces the single `blur88/all` repository, which mixed floating and versioned tags; that repository was deleted and nothing was migrated: both new repositories start empty and fill from the next Release.

## Consequences

- Production depends on the Release repository staying public: `setup.sh` never runs `docker login`.
- Between the switch and the first subsequent Release, the Release repository has no tags and a production pull fails.
- There is no rollback tooling; the versioned tags in the Release repository are what one would pin to if it is ever needed.
