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
volumes_cfg = cfg.get("volumes") or {}

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
        vtype = vol.get("type")
        target = vol.get("target")
        if vtype in ("volume", "tmpfs"):
            # Named volumes and tmpfs are not inspected for a source path, but
            # they are not waved through either: a named volume declared
            # `external: true` would escape the -p project prefix and could be
            # shared with the dev stack. -p prefixes non-external named volumes,
            # so this is unlikely — but "isolation: OK" must not be printed over
            # a mount class nobody looked at.
            vol_name = vol.get("source") or "(anonymous)"
            if vtype == "volume" and (volumes_cfg.get(vol_name) or {}).get("external"):
                problems.append(
                    f"{name}: EXTERNAL named volume {vol_name} -> {target} "
                    f"escapes the -p project prefix and may be shared with another stack"
                )
            continue
        if vtype != "bind":
            problems.append(
                f"{name}: mount of unrecognised type {vtype} -> {target}; "
                f"this check cannot certify it, so it fails closed"
            )
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
            if p is None or not str(p).isdigit():
                problems.append(
                    f"{name}: published port {port!r} has no numeric host port; "
                    f"the collision check cannot read it, so it fails closed"
                )
                continue
            published.add(str(p))
        else:
            # compose renders the dict form from `config --format json` in
            # practice, so this is a dead branch — but a dead branch that
            # FAILED OPEN. "3000" (short form, container port) and
            # "127.0.0.1:3000:80" both used to slip past the collision cases
            # below, because rsplit(":", 1)[0] returns the wrong field for each.
            problems.append(
                f"{name}: published port rendered as {port!r} rather than an object; "
                f"the host port cannot be identified unambiguously, so it fails closed"
            )

# The database the gate stack actually creates. Check 6 compares this with the
# GATE_DB_NAME constant the fixture guards on — see below for why neither side
# may be hardcoded here.
pg_env = (services.get("postgres") or {}).get("environment") or {}
if isinstance(pg_env, list):  # compose can render environment as KEY=VALUE strings
    pg_env = dict(
        (item.split("=", 1) + [""])[:2] for item in pg_env if isinstance(item, str)
    )
postgres_db = pg_env.get("POSTGRES_DB") or ""

out = {
    "problems": problems,
    "container_names": container_names,
    "latest_images": latest_images,
    "published": sorted(published, key=lambda x: (len(x), x)),
    "has_nginx": has_nginx,
    "postgres_db": postgres_db,
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

# 6. The fixture's destructive-write guard must name the database this stack
#    actually creates.
#
#    print-fixture.ts refuses to run its DELETE unless the connected database
#    equals its GATE_DB_NAME constant, compared against server-side
#    current_database(). That constant is deliberately hardcoded there — making
#    it configurable is what made the first version of that guard vacuous — so
#    it and POSTGRES_DB are a two-place edit with nothing pairing them. Renaming
#    the stack's database without updating the constant aborts every run.
#
#    BOTH sides are READ, neither is written here. A check that hardcoded the
#    value it verifies would be the same tautology class the guard itself just
#    had to be fixed for: it would agree with itself and never fail.
FIXTURE_SRC="frontend/e2e/fixtures/print-fixture.ts"
compose_db="$(read_field postgres_db)"
if [ ! -r "$FIXTURE_SRC" ]; then
  fixture_db=""
  fixture_db_err="cannot read $FIXTURE_SRC"
else
  # `const GATE_DB_NAME = 'erp_print_gate'` — single or double quoted.
  fixture_db="$(sed -n "s/^const[[:space:]]\+GATE_DB_NAME[[:space:]]*=[[:space:]]*['\"]\([^'\"]*\)['\"].*/\1/p" "$FIXTURE_SRC" | head -1)"
  fixture_db_err="GATE_DB_NAME not found in $FIXTURE_SRC"
fi

if [ -z "$compose_db" ]; then
  fail "could not read POSTGRES_DB for the postgres service from the resolved compose config"
elif [ -z "$fixture_db" ]; then
  fail "$fixture_db_err (needed to verify the fixture's destructive-write guard)"
elif [ "$compose_db" != "$fixture_db" ]; then
  fail "gate database name disagrees between the stack and the fixture's write guard:
    POSTGRES_DB  = $compose_db  (postgres service, docker-compose.print-gate.yml, resolved)
    GATE_DB_NAME = $fixture_db  ($FIXTURE_SRC)
  The fixture refuses to run unless the CONNECTED database equals GATE_DB_NAME,
  so a mismatch aborts every print-gate run. Update both together."
fi

# 7. Every site that spells out the compose argument set must agree.
#
#    The brief asked for ONE compose argument array, and each script honours
#    that internally — but "identical" is otherwise maintained by hand across
#    four files in two languages (this script, print-gate-up.sh, ci.yml's
#    COMPOSE_ARGS, and print-fixture.ts's psqlScalar). Rather than invent a
#    cross-language shared source, assert agreement the way check 6 does: read
#    every site, compare, and fail naming the disagreement.
#
#    The project name is the discriminator — it is what -p sets, what prefixes
#    every container and network, and what a divergence would silently split in
#    two (one stack built, a different one torn down).
#
#    Matching is on the project name as an ARGUMENT or string literal, not on
#    prose: the first version of this check flagged its own explanatory comment,
#    which is a false positive but also a useful reminder that a grep over
#    source is matching comments too.
EXPECTED_PROJECT="erp_print_gate"
project_sites=(
  "scripts/print-gate-isolation-check.sh"
  "scripts/print-gate-up.sh"
  ".github/workflows/ci.yml"
  "frontend/e2e/fixtures/print-fixture.ts"
)
for site in "${project_sites[@]}"; do
  if [ ! -r "$site" ]; then
    fail "compose-argument site $site is missing or unreadable"
    continue
  fi
  # Every site must mention -p / PRINT_GATE_PROJECT with the same project name,
  # and must not mention any OTHER erp_print_gate-like project name.
  if ! grep -q "$EXPECTED_PROJECT" "$site"; then
    fail "compose-argument site $site does not mention the gate project name $EXPECTED_PROJECT"
  fi
  # Only real usages: -p <name>, PRINT_GATE_PROJECT ?? '<name>', or a quoted
  # literal. Bare prose mentions are ignored.
  other="$(grep -oE "(-p +|PRINT_GATE_PROJECT[^']*'|[\"'])erp_print_gate[A-Za-z0-9_]+" "$site" \
    | grep -oE "erp_print_gate[A-Za-z0-9_]+" | sort -u | paste -sd, - || true)"
  if [ -n "$other" ]; then
    fail "compose-argument site $site names a DIFFERENT gate project: $other (expected $EXPECTED_PROJECT)"
  fi
  # Both override files must be named wherever compose files are listed at all.
  if grep -q "docker-compose.print-gate.yml" "$site" \
     && ! grep -q "docker-compose.yml" "$site"; then
    fail "compose-argument site $site names docker-compose.print-gate.yml without the base docker-compose.yml; the override would not merge onto the base"
  fi
done

# 5. nginx must not be part of the gate's service set.
if [ "$(read_field has_nginx)" = "True" ]; then
  echo "note: nginx is defined in the merged config; the CI job MUST select" >&2
  echo "      services explicitly (postgres redis backend frontend)." >&2
fi

if [ "$status" -eq 0 ]; then
  echo "print-gate compose isolation: OK"
  echo "published host ports: $(echo "$published" | paste -sd, -)"
  echo "gate database: $compose_db (matches GATE_DB_NAME in $FIXTURE_SRC)"
fi
exit "$status"
