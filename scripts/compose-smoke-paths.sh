#!/usr/bin/env bash
# Decide whether the Compose deployment and ingress smoke test must run (#1966).
#
# Reads changed file paths, one per line, from stdin. Exits 0 and names the
# first path that can affect the deployed stack; exits 1 when none can.
#
# Keep this list in step with the "Compose deployment and ingress smoke test"
# steps in the Frontend job of .github/workflows/ci.yml. The workflow file
# itself is on the list so that editing those steps runs them.
set -uo pipefail

while IFS= read -r changed; do
  case "$changed" in
    deploy.sh | docker-compose*.yml | nginx/* | frontend/nginx.conf | .env.example | \
      scripts/ingress-smoke.sh | scripts/compose-smoke-paths.sh | .github/workflows/ci.yml)
      echo "Compose smoke test needed: $changed changed"
      exit 0
      ;;
  esac
done

exit 1
