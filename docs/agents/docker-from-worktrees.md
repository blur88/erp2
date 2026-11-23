# Docker verification from Git worktrees

Prefer isolated image verification for worktree changes. Use isolated integration
verification when the check needs multiple services. If required checks already
have qualifying CI evidence, follow the [repository verification rules](../../AGENTS.md#change-scoped-verification-required-before-pr).

## Check prerequisites and collisions

A clean worktree normally lacks its own `.env` and `node_modules`. Check the
working directory, Docker context, and prerequisites for the selected command.
For host-side tests, install dependencies in the worktree if needed. Image
verification can use the Dockerfile's dependency install and needs no live
secrets. For services that need credentials, provide nonblank test-only values
before starting them. Keep the test environment file untracked.

Check the effective Compose files, including the automatically loaded
[development override](../../docker-compose.override.yml), against the resources
on the target Docker daemon. Both the [development file](../../docker-compose.yml)
and the [production file](../../docker-compose.prod.yml) declare fixed names
such as `erp_backend` and `erp_nginx`. Compose `-p` changes the project name,
but fixed `container_name` values must still be unique on the daemon.

Redirecting Compose to the main checkout can select the running project.
When the project name comes from the checkout directory, that means `erp2`.
Compose `up` then targets its existing services and can recreate them with the
candidate images. This is how the running frontend and NGINX containers were
replaced during verification for #2035.

- **Published ports** are shared on the host. Check host addresses and ports,
  including PostgreSQL and Redis ports added by the development override.
- **Image tags** are shared on the daemon. A build using a tag such as
  `erp-frontend:latest` can change the image used the next time the main stack
  recreates a container.
- **Volumes and bind mounts** can share data across projects. Check explicit
  volume names and external volumes, as well as resolved host paths for
  PostgreSQL, Redis, uploads, logs, and backups. Pointing Compose at the main
  checkout can select its data directories.

To list the configured resources without starting services or printing the
service environment, run this from the worktree with `jq` installed and a
test-only env file. Use the same project name, Compose files and env file
you intend to use for the run.

```sh
docker compose --env-file .env.worktree.local config --format json |
  jq '{name, services: (.services | map_values({container_name, image, ports, volumes, networks})), volumes, networks}'
```

This example uses the default development files, including the automatic
override. For a different file set, pass each file explicitly with `-f`.
Compare the output with the running stack before starting services.

## Isolated image verification

Build from the candidate worktree with `docker build` and assign each image a
unique local tag. Run targeted checks in disposable containers with no published
ports, live mounts, or live network attachments. Read the selected service's build
context and arguments in the Compose file if the check needs to match its build.

For example, from the worktree root, build and validate the candidate NGINX image
in a subshell:

```sh
(
  set -e
  candidate_image="erp-nginx:worktree-$(git rev-parse --short HEAD)-$(date +%s)-$$"
  docker build -t "$candidate_image" ./nginx
  docker run --rm --network none \
    --add-host backend:127.0.0.1 --add-host frontend:127.0.0.1 \
    "$candidate_image" nginx -t
)
```

`nginx -t` can fail when upstream hostnames such as `backend` and `frontend`
cannot resolve outside the intended network. The example supplies local hostname
entries for syntax and configuration validation. For proxy or connectivity
checks, use an isolated network with resolvable test upstreams. Running
`nginx -t` inside a live container validates the configuration in that container.
Validate the candidate image or explicitly mounted candidate configuration to
verify the worktree changes.

## Isolated integration verification

1. Use a standalone test Compose file and select it explicitly with `-f`.
   Compose can retain base port mappings when an override adds new ones, so a
   test port can coexist with a live stack's port in the merged configuration.
   Use a unique project name, generated or unique container names, and a
   project-specific network. Omit host port mappings where possible. Otherwise
   use free ports bound to loopback.
2. Assign unique local tags to candidate images. Use project-scoped volumes or
   dedicated scratch directories and disposable test data. Keep all production
   and main-stack data directories and external volumes out of the test project.
   Set database and cache endpoints to the isolated services and supply nonblank
   test-only secrets, including database and Redis passwords and a JWT secret.
3. Use the same explicit project name, Compose files, and test env file for
   `docker compose config`, startup, and teardown. Inspect the resolved config
   for names, ports, tags, networks, mount sources, endpoints, and credentials.
   Check for shell environment overrides and keep resolved secrets out of logs.
   Start the project once each resource is confirmed to belong to the test
   setup. Run the targeted checks, then tear down that project and clean up its
   disposable resources.

## Intentional live-stack deployment

Use the main checkout and Compose project `erp2` to replace running services
only with explicit maintainer authorization. Before executing, state which
services and images will be replaced, the expected interruption, and any
migration or persistent data impact. Use isolated verification or CI while
authorization is absent.
