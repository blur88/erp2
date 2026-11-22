# Docker Scout base image recommendations: why they don't appear

Research note, 2026-11-20. Every claim links to a primary source: docs.docker.com, the `docker/scout-cli`, `moby/buildkit` and `docker/build-push-action` GitHub repositories, or live output from Docker's own tooling run against the published images, labelled **Observed**. Anything without such a source is marked **Unverified**.

## Short answer

1. **Scout analysis is not turned on for the Hub repository you are most likely looking at.** `docker scout repo list --org blur88` reports `blur88/erp2` as **not enabled** and `blur88/master` as enabled, with `Organization blur88 has 1 of 2 repositories enabled (entitled to 1 enabled repositories)` (**Observed**). Docker Hub shows the **View recommended base image fixes** button only on "a repository … where you have activated Docker Scout image analysis" ([Image details view](https://docs.docker.com/scout/explore/image-details-view/#recommendations-in-docker-hub)). The public Release repository `blur88/erp2` therefore shows no recommendations. Because the plan allows only one Scout-enabled repository, you have to choose which repository gets it ([analysis docs](https://docs.docker.com/scout/explore/analysis/#activate-docker-scout-on-a-repository)).
2. **The recommendations themselves exist.** The CLI produces them for both images right now (**Observed**, see [Evidence](#evidence-observed-2026-11-20)): the frontend can refresh to `nginx:1.30-alpine-slim` (now 1.30.7 on alpine3.24), and the backend can refresh or update its `node:24-alpine` base. The cause is where you are looking, not the base images or the build.
3. **A second, smaller problem.** The images carry max-mode provenance in **SLSA v1** format. BuildKit has produced v1 by default since v0.28.0 ([release notes](https://github.com/moby/buildkit/releases/tag/v0.28.0)). Scout CLI could only read v1 from v1.20.0 onward ([release notes](https://github.com/docker/scout-cli/releases/tag/v1.20.0)). The locally installed CLI (v1.18.4) therefore falls back to *auto-detecting* the base image from layers, and the policies that depend on provenance report "No data". Whether the Scout **platform** (Hub and Dashboard) reads SLSA v1 provenance is **Unverified**.

## Findings

### 1. How Scout detects the base image

- **Layer matching (fallback).** Layer digests from the manifest "are matched against your own private images and Docker's database of public images … The image that shares most of the layers is considered a base image match" ([Data handling](https://docs.docker.com/scout/deep-dive/data-handling/#image-metadata)).
- **Provenance (preferred).** For images with provenance attestations, Scout stores "Materials, Base image, VCS information, Dockerfile" ([Data handling — Provenance](https://docs.docker.com/scout/deep-dive/data-handling/#provenance)). A Docker staff member explained the difference: without full provenance, "Docker Scout cannot know for certain which base image tag you used, and instead makes a best guess on your base image based on the digest, which might be wrong" ([scout-cli#84](https://github.com/docker/scout-cli/issues/84#issuecomment-1884668527)).
- **Max mode matters.** Since v1.9.1, the CLI warns when provenance was not built in max mode, because "base image might be auto-detected and might result in less accurate results" ([v1.9.1 notes](https://github.com/docker/scout-cli/releases/tag/v1.9.1)). Docker's DHI docs also say Scout "uses max-mode provenance attestations to identify the … base image" ([Scan DHI](https://docs.docker.com/dhi/how-to/scan/#build-child-images-with-provenance-attestations)).
- **Labels.** Image labels are collected as metadata ([Data handling](https://docs.docker.com/scout/deep-dive/data-handling/#image-metadata)). No source says labels are used for base image detection (**Unverified**, and probably not).
- **Base images outside Docker's index.** v1.4.1 fixed the display of a base image "not indexed by docker scout but defined in the provenance attestation (for private or non Docker Trusted Content base images)" ([v1.4.1 notes](https://github.com/docker/scout-cli/releases/tag/v1.4.1)). This implies that recommendation data depends on the base image being in Scout's index. Official `node` and `nginx` images clearly are, since both produce recommendations (**Observed**).

### 2. Conditions that suppress or degrade results

| Condition | Effect | Source |
|---|---|---|
| Hub repository not enabled for Scout | No analysis is stored and no recommendations button appears on Hub | [Hub image security insights](https://docs.docker.com/docker-hub/repos/manage/vulnerability-scanning/), [Image details view](https://docs.docker.com/scout/explore/image-details-view/#recommendations-in-docker-hub) |
| Plan's Scout-enabled repository limit reached | Additional repositories cannot be enabled | [Analysis — activate](https://docs.docker.com/scout/explore/analysis/#activate-docker-scout-on-a-repository) (links to pricing); **Observed** `entitled to 1 enabled repositories` |
| Activating requires the Editor or Owner role in the org | Others cannot enable | [Analysis](https://docs.docker.com/scout/explore/analysis/#activate-docker-scout-on-a-repository) |
| No provenance attestation | "No outdated base images" and "Approved Base Images" report **No data** | [Policy — No base image data](https://docs.docker.com/scout/policy/#no-base-image-data) |
| Provenance not in max mode, or unreadable | Base image is auto-detected and may be wrong (for example, wrong tag family) | [v1.9.1 notes](https://github.com/docker/scout-cli/releases/tag/v1.9.1), [#84](https://github.com/docker/scout-cli/issues/84) |
| SLSA v1 provenance read by a CLI older than v1.20.0 | Treated as missing, so the base image is auto-detected | [BuildKit v0.28.0](https://github.com/moby/buildkit/releases/tag/v0.28.0), [scout-cli v1.20.0](https://github.com/docker/scout-cli/releases/tag/v1.20.0); **Observed** with v1.18.4 |
| Image has no base image (for example, `FROM scratch`), or the base is not recognised | "image has no base image", no recommendations | [scout-cli#212](https://github.com/docker/scout-cli/issues/212), [v1.11.0 notes](https://github.com/docker/scout-cli/releases/tag/v1.11.0) |
| Pinned tag already at its latest digest | Nothing to refresh. The policy flags only when "the tag you built from points to a different digest than what you're using" | [Policy — No outdated base images](https://docs.docker.com/scout/policy/#no-outdated-base-images) |
| Image larger than 10 GB uncompressed without an SBOM attestation | Platform analysis is skipped | [Analysis — max size](https://docs.docker.com/scout/explore/analysis/#maximum-image-size) (not relevant here) |

Known false results, for context: Scout has flagged a base image as outdated when it was not ([#183](https://github.com/docker/scout-cli/issues/183)), recommended non-LTS tags ([#187](https://github.com/docker/scout-cli/issues/187)), and intermittently dropped base-image policies even with `--provenance=mode=max` ([#221](https://github.com/docker/scout-cli/issues/221), closed without a recorded resolution).

### 3. Official Images only? Alpine and slim tags?

- No Docker doc restricts recommendations to Docker Official Images. The docs describe recommendations generically ([Image details view](https://docs.docker.com/scout/explore/image-details-view/#recommendations-for-base-image), [CLI reference](https://docs.docker.com/reference/cli/docker/scout/recommendations/)). Whether Scout can recommend for *non-indexed* base images is **Unverified** (see the v1.4.1 note above).
- `nginx:*-alpine*-slim` is supported. The CLI identifies `nginx:1.30-alpine-slim`, lists `Flavor: alpine` and "Tag is using slim variant", and recommends `1.30-alpine-slim` (refresh) and `1.31-alpine-slim` (change) (**Observed**).
- `node:*-alpine3.23` is supported. The CLI auto-detects `node:24-alpine` and suggests `node:24-alpine3.23` as the updated base (**Observed**). Auto-detection picked a broader tag than the pinned `node:24.16.0-alpine3.23`, which is the inaccuracy that #84 describes. `--tag` overrides it ([#84 staff comment](https://github.com/docker/scout-cli/issues/84#issuecomment-1884668527)).

### 4. Where recommendations are shown

- **Docker Hub:** on the Tags tab, select a tag and then **View recommended base image fixes**. This works only for Scout-activated repositories ([Image details view](https://docs.docker.com/scout/explore/image-details-view/#recommendations-in-docker-hub)).
- **Docker Desktop:** Images view, **Recommended fixes** drop-down ([same page](https://docs.docker.com/scout/explore/image-details-view/#recommendations-in-docker-desktop)).
- **Scout Dashboard:** image details view, plus a **Base images** section ([Dashboard](https://docs.docker.com/scout/explore/dashboard/)).
- **CLI:** `docker scout recommendations` with `--only-refresh`, `--only-update`, `--tag` and `--platform` ([CLI reference](https://docs.docker.com/reference/cli/docker/scout/recommendations/)). `docker scout quickview` shows "Refreshed" and "Updated" base image rows when the base is outdated ([Analysis — Quickview](https://docs.docker.com/scout/explore/analysis/#quickview)). The CLI works on any image you can pull, whether or not the repository is enabled (**Observed** on `blur88/erp2`).
- **Refresh vs. update:** "Refresh" means the same tag at a newer digest. "Change" or "update" means a different tag ([Image details view](https://docs.docker.com/scout/explore/image-details-view/#refresh-base-image)).
- **Legacy "Basic" Hub scanning:** the current Hub docs list only "Docker Scout image analysis" or "None" under **Image security insight settings** ([Hub docs](https://docs.docker.com/docker-hub/repos/manage/vulnerability-scanning/)). Whether a legacy option still shows on older repositories is **Unverified**.

### 5. Provenance from build-push-action

- Attestations are stored as manifests in the image index, with platform `unknown/unknown` and annotation `vnd.docker.reference.type: attestation-manifest`. This is by design, "to prevent container runtimes from accidentally pulling or running" them, and is not an error ([Attestation storage](https://docs.docker.com/build/metadata/attestations/attestation-storage/)).
- build-push-action adds max-mode provenance by default for public GitHub repositories and min mode for private ones. Setting `provenance: mode=max` explicitly is the recommended override ([GHA attestations](https://docs.docker.com/build/ci/github-actions/attestations/#default-provenance)).
- The docs still say `version=v0.2` is the default ([SLSA provenance — Version](https://docs.docker.com/build/metadata/attestations/slsa-provenance/#version)). BuildKit v0.28.0 (2026-03-04) changed it: "The default provenance format has been switched to SLSA v1.0" ([release](https://github.com/moby/buildkit/releases/tag/v0.28.0)). The published images confirm v1: the `.Provenance.SLSA` keys are `buildDefinition` and `runDetails` (**Observed**).
- Multi-stage builds: provenance materials list *every* stage's image. The frontend lists both `node:24.15.0-alpine3.23` (builder) and `nginx:1.30.0-alpine3.23-slim` (**Observed**). How Scout chooses the base image from several materials, presumably the final stage, is **Unverified**: no doc states it.

## Evidence (Observed, 2026-11-20)

Commands run from this machine against public tags. Local Scout CLI v1.18.4, buildx v0.39.0.

- Image index for `blur88/erp2:latest-backend` and `latest-frontend`: one `linux/amd64` manifest plus one `unknown/unknown` attestation manifest each. The `blur88/master:erp2-*` indexes have the same digests.
- Provenance materials: backend `pkg:docker/node@24.16.0-alpine3.23`; frontend `pkg:docker/nginx@1.30.0-alpine3.23-slim` and `pkg:docker/node@24.15.0-alpine3.23`. Max-mode `source.infos` (Dockerfile) are present.
- `docker scout quickview blur88/erp2:latest-backend`: `Base image was auto-detected`, base `node:24-alpine` 6C 50H; refreshed `node:24-alpine` 1C 11H; updated `node:24-alpine3.23` 1C 6H.
- `docker scout quickview blur88/erp2:latest-frontend`: same auto-detect notice, base `nginx:1.30-alpine-slim` 4C 20H; refreshed 1C 5H; updated `nginx:1.31-alpine-slim`.
- `docker scout recommendations blur88/erp2:latest-frontend`: the current base digest was "Pushed 7 months ago". It recommends refreshing to `1.30-alpine-slim`, also known as `1.30.7-alpine3.24-slim`, pushed 1 day ago, which removes 30 vulnerabilities.
- `docker scout repo list --org blur88`: `blur88/erp2` not enabled, `blur88/master` enabled, entitled to 1.
- `docker scout quickview blur88/master:erp2-frontend --org blur88`: all **7/7 policies "No data"**. This includes policies unrelated to provenance, such as "Default non-root user". The cause is **Unverified** (see Open questions).

## Likely causes for this repo, ranked

1. **`blur88/erp2` is not Scout-enabled, and the plan allows one repository, which is spent on `blur88/master`.** This is decisive for the Hub UI on the public repository. Fix: enable `blur88/erp2` in [Scout repository settings](https://scout.docker.com/settings/repos) (`https://scout.docker.com/org/blur88/settings/repos`) and disable `blur88/master`, or upgrade the plan. Alternatively, look at the `blur88/master` tags in Hub, which hold the same digests.
2. **Policy and base-image data not populated even on the enabled repository.** All seven policies report "No data" for `blur88/master:erp2-frontend`. Possible reasons: the platform has not analysed that digest, or the platform does not read SLSA v1 provenance. Both are **Unverified**. Check in the Dashboard whether `blur88/master` lists the current digest.
3. **SLSA v1 provenance not read by older Scout clients.** This is proven for CLI v1.18.4 and **Unverified** for the platform. Fixes: upgrade the CLI to v1.20.0 or later (the latest is v1.29.0). If the platform also turns out to ignore v1, pin `provenance: mode=max,version=v0.2` in `release.yml` (the parameter is documented in [SLSA provenance — Version](https://docs.docker.com/build/metadata/attestations/slsa-provenance/#version)). That pin is a fallback, not a confirmed fix.
4. **Auto-detected tag family differs from the pinned tag** (`node:24-alpine` instead of `node:24.16.0-alpine3.23`). This makes recommendations less precise but does not remove them. Use `--tag <tag from backend/Dockerfile>` ([#84](https://github.com/docker/scout-cli/issues/84#issuecomment-1884668527)).
5. **Fully pinned patch tags may stop receiving rebuilds.** `nginx:1.30.0-alpine3.23-slim` was last pushed about 7 months ago, while `1.30-alpine-slim` moved to 1.30.7 on alpine3.24 (**Observed**). Docker Official Images' policy on how long exact patch tags keep getting rebuilt is **Unverified**. If the tag never moves, a "refresh" of the exact tag is never offered, only a "change".

## Diagnostic commands

```bash
# Is the repository Scout-enabled, and what is the entitlement?
docker scout repo list --org blur88

# Attestation manifests present? (expect unknown/unknown + attestation-manifest)
docker buildx imagetools inspect blur88/erp2:latest-frontend

# Provenance version and base-image materials
docker buildx imagetools inspect blur88/erp2:latest-frontend --format '{{json .Provenance.SLSA}}' \
  | jq '{v1: has("buildDefinition"), deps: (.buildDefinition.resolvedDependencies // .materials) | map(.uri)}'

# Upgrade the CLI first (SLSA v1 support needs v1.20.0+), then:
docker scout version
docker scout quickview blur88/erp2:latest-frontend          # does "Base image was auto-detected" disappear?
docker scout recommendations blur88/erp2:latest-frontend
docker scout recommendations --only-refresh blur88/erp2:latest-backend --tag <tag from backend/Dockerfile>
docker scout recommendations --only-update  blur88/erp2:latest-frontend --tag 1.30.0-alpine3.23-slim

# Policy view against the org (enabled repository)
docker scout quickview blur88/master:erp2-frontend --org blur88
```

## Open questions / unverified

- **Does the Scout platform read SLSA v1 provenance?** Not tested. Running Scout CLI v1.29.0 was blocked in this session, so it is also unconfirmed that the auto-detect notice disappears with a current CLI. Run the upgraded CLI commands above.
- **Why are all 7 policies "No data" on the enabled `blur88/master`?** Possible reasons: no stored analysis for that digest, an org policy configuration issue, or the CLI v1.18.4 / server API mismatch. Separately, the current docs describe `docker scout policy` as local, in-process evaluation, where "No data is sent to the Scout service" ([Policy Evaluation](https://docs.docker.com/scout/policy/#how-policy-evaluation-works)). How this relates to the server-side policies that Hub and the Dashboard show is unclear from the docs.
- **Base image selection in multi-stage builds:** which provenance material Scout treats as the base image is undocumented.
- **Exact Scout repository limits per plan:** the docs defer to the [pricing page](https://www.docker.com/pricing?ref=Docs&refAction=DocsScoutAnalysis). The CLI reported 1 for this account.
- **Legacy "Basic" Hub vulnerability scanning:** not mentioned in the current docs, so its status on older repositories is unknown.
