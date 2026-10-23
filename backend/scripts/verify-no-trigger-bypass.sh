#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
REPO_DIR="$(cd "$REPO_DIR" && pwd)"
SRC_DIR="$REPO_DIR/backend/src"
MIGRATIONS_DIR="$SRC_DIR/database/migrations/"

if [ ! -d "$SRC_DIR" ]; then
  printf 'Backend application source directory not found: %s\n' "$SRC_DIR" >&2
  exit 2
fi

found=0

report_matches() {
  local file="$1" relative_file="$2" pattern="$3" match_type="$4"
  perl -0777 -e '
    my ($source_path, $display_path, $pattern, $kind) = @ARGV;
    @ARGV = ($source_path);
    local $/;
    my $source = <>;
    while ($source =~ /$pattern/ig) {
      my $line = 1 + (substr($source, 0, $-[0]) =~ tr/\n//);
      my $matched = $&;
      $matched =~ s/\s+/ /g;
      print "$display_path:$line: $kind: $matched\n";
    }
  ' "$file" "$relative_file" "$pattern" "$match_type" >&2
}

while IFS= read -r -d '' file; do
  relative_file="${file#"$REPO_DIR/"}"

  # Trigger disabling is forbidden throughout src, including migrations.
  if perl -0777 -e 'local $/; exit(<> =~ /\bDISABLE\s+TRIGGER\b/i ? 0 : 1)' "$file"; then
    report_matches "$file" "$relative_file" '\bDISABLE\s+TRIGGER\b' 'forbidden trigger disable'
    found=1
  fi

  # Migrations may create and drop triggers as part of schema evolution.
  case "$file" in
    "$MIGRATIONS_DIR"*) continue ;;
  esac
  if perl -0777 -e 'local $/; exit(<> =~ /\bDROP\s+TRIGGER\b/i ? 0 : 1)' "$file"; then
    report_matches "$file" "$relative_file" '\bDROP\s+TRIGGER\b' 'trigger drop outside migrations'
    found=1
  fi
done < <(find "$SRC_DIR" -type f -print0)

if [ "$found" -ne 0 ]; then
  printf 'Trigger bypass SQL is forbidden in backend application source; only DROP TRIGGER in migrations is allowed.\n' >&2
  exit 1
fi
