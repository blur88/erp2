#!/usr/bin/env bash
# Verifies the RESOLVED print-gate compose config is fully isolated (#1214).
#
# Asserts against `config` output, not the source files: overrides merge, and
# only the resolved result proves what would actually run.
#
# `config --format json` rather than the YAML rendering, deliberately. The YAML
# form was grepped line-by-line, which cannot associate a mount's `source` with
# its read-only flag — they are separate lines. That let a SHARED, WRITABLE bind
# pass: `database/init` was exempted by PATH alone, so flipping it from `:ro` to
# `:rw` still printed "isolation: OK" (review finding 5). Each mount is now
# validated as one object: source AND read_only together.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -p erp_print_gate
  -f docker-compose.yml -f docker-compose.print-gate.yml)

resolved_json="$("${COMPOSE[@]}" config --format json)"
status=0
fail() { echo "::error::$1" >&2; status=1; }

# The single source of truth for what a shared bind path may be. A path listed
# here is allowed ONLY read-only; anything writable must live under the gate's
# own .print-gate-data directory.
#
# Kept in the Python check below rather than a shell array so the source/flag
# pairing cannot drift back apart.
python_report="$(printf '%s' "$resolved_json" | python3 -c '
import json, os, sys

repo = os.getcwd()
cfg = json.load(sys.stdin)
services = cfg.get("services") or {}

# Writable binds are confined to this directory; every other bind source must
# be BOTH in the allow-list and read-only.
GATE_DATA = os.path.join(repo, ".print-gate-data")
READ_ONLY_SHARED = {os.path.join(repo, "database", "init")}

problems = []
container_names = []
latest_images = []
published = set()
has_nginx = "nginx" in services

def under(path, root):
    return path == root or path.startswith(root + os.sep)

for name, svc in sorted(services.items()):
    cn = svc.get("container_name")
    if cn:
        container_names.append(f"{name}={cn}")

    image = svc.get("image") or ""
    if image in ("erp-backend:latest", "erp-frontend:latest", "erp-nginx:latest"):
        latest_images.append(f"{name}={image}")

    for vol in svc.get("volumes") or []:
        if not isinstance(vol, dict):
            problems.append(f"{name}: unparsed volume entry {vol!r} (short syntax survived resolution)")
            continue
        if vol.get("type") != "bind":
            continue
        source = vol.get("source") or ""
        # compose reports read-only as a top-level `read_only: true`.
        read_only = bool(vol.get("read_only"))
        target = vol.get("target")

        if under(source, GATE_DATA):
            continue  # the gate owns this directory; writable is correct here
        if source in READ_ONLY_SHARED:
            if not read_only:
                problems.append(
                    f"{name}: shared bind {source} -> {target} is WRITABLE; "
                    f"shared paths must be mounted read-only (:ro)"
                )
            continue
        problems.append(
            f"{name}: bind source {source} -> {target} is neither under "
            f".print-gate-data nor an allow-listed read-only shared path "
            f"(read_only={read_only})"
        )

    for port in svc.get("ports") or []:
        if isinstance(port, dict):
            p = port.get("published")
        else:
            p = str(port).rsplit(":", 1)[0]
        if p:
            published.add(str(p))

out = {
    "problems": problems,
    "container_names": container_names,
    "latest_images": latest_images,
    "published": sorted(published, key=lambda x: (len(x), x)),
    "has_nginx": has_nginx,
}
print(json.dumps(out))
')"

read_field() { printf '%s' "$python_report" | python3 -c "
import json,sys
d=json.load(sys.stdin)
v=d['$1']
print('\n'.join(v) if isinstance(v,list) else v)
"; }

# 1. No fixed container names — they override the project prefix.
container_names="$(read_field container_names)"
if [ -n "$container_names" ]; then
  fail "resolved config keeps a fixed container_name: $(echo "$container_names" | paste -sd, -)"
fi

# 2. No shared :latest image tags.
latest_images="$(read_field latest_images)"
if [ -n "$latest_images" ]; then
  fail "resolved config would build/overwrite a shared :latest image tag: $(echo "$latest_images" | paste -sd, -)"
fi

# 3. Every bind mount is either under .print-gate-data (writable is fine) or an
#    allow-listed shared path mounted READ-ONLY. Source and flag checked as one.
bind_problems="$(read_field problems)"
if [ -n "$bind_problems" ]; then
  while IFS= read -r line; do
    [ -n "$line" ] && fail "$line"
  done <<<"$bind_problems"
fi

# 4. No host port collides with the dev stack's published ports.
published="$(read_field published)"
for p in $published; do
  case "$p" in
    80|443|3000|3001|5432|6379)
      fail "host port $p collides with the dev stack; use a gate-specific port" ;;
  esac
done

# 5. nginx must not be part of the gate's service set.
if [ "$(read_field has_nginx)" = "True" ]; then
  echo "note: nginx is defined in the merged config; the CI job MUST select" >&2
  echo "      services explicitly (postgres redis backend frontend)." >&2
fi

if [ "$status" -eq 0 ]; then
  echo "print-gate compose isolation: OK"
  echo "published host ports: $(echo "$published" | paste -sd, -)"
fi
exit "$status"
