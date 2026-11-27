#!/usr/bin/env bash
# Lint workflows and shell scripts with pinned tools on Linux x86_64 (#2084).
# Extracting the ShellCheck archive requires xz.
set -euo pipefail

platform=$(uname -sm)
if [[ "$platform" != "Linux x86_64" ]]; then
  echo "lint-workflows: unsupported platform ($platform). Use Linux x86_64." >&2
  exit 1
fi
install_dir=$(mktemp -d)
trap 'rm -rf "$install_dir"' EXIT
download_verified_archive() {
  local url=$1 archive=$2 checksum=$3

  curl -fsSL "$url" -o "$archive"
  printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --status
}

actionlint_version=1.7.12
download_verified_archive \
  "https://github.com/rhysd/actionlint/releases/download/v$actionlint_version/actionlint_${actionlint_version}_linux_amd64.tar.gz" \
  "$install_dir/actionlint.tar.gz" \
  8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8
tar -xzf "$install_dir/actionlint.tar.gz" -C "$install_dir" actionlint

shellcheck_version=0.11.0
download_verified_archive \
  "https://github.com/koalaman/shellcheck/releases/download/v$shellcheck_version/shellcheck-v$shellcheck_version.linux.x86_64.tar.xz" \
  "$install_dir/shellcheck.tar.xz" \
  8c3be12b05d5c177a04c29e3c78ce89ac86f1595681cab149b65b97c4e227198
tar -xJf "$install_dir/shellcheck.tar.xz" -C "$install_dir" --strip-components=1 "shellcheck-v$shellcheck_version/shellcheck"
shellcheck="$install_dir/shellcheck"
"$shellcheck" --version
"$install_dir/actionlint" -shellcheck "$shellcheck"

git ls-files -z -- ':(glob)scripts/**/*.sh' ':(glob)backend/scripts/**/*.sh' |
  xargs -0 -r "$shellcheck" -x -P SCRIPTDIR --
