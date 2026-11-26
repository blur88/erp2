#!/usr/bin/env bash
# Lint workflows and shell scripts with pinned tools on Linux x86_64.
set -euo pipefail

platform=$(uname -sm)
if [[ "$platform" != "Linux x86_64" ]]; then
  echo "lint-workflows: unsupported platform ($platform). Use Linux x86_64." >&2
  exit 1
fi
install_dir=$(mktemp -d)
trap 'rm -rf "$install_dir"' EXIT
curl -fsSL https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz \
  -o "$install_dir/actionlint.tar.gz"
echo "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8  $install_dir/actionlint.tar.gz" | sha256sum --check --status
tar -xzf "$install_dir/actionlint.tar.gz" -C "$install_dir" actionlint

shellcheck_version=v0.11.0
curl -fsSL "https://github.com/koalaman/shellcheck/releases/download/$shellcheck_version/shellcheck-$shellcheck_version.linux.x86_64.tar.xz" \
  -o "$install_dir/shellcheck.tar.xz"
echo "8c3be12b05d5c177a04c29e3c78ce89ac86f1595681cab149b65b97c4e227198  $install_dir/shellcheck.tar.xz" | sha256sum --check --status
tar -xJf "$install_dir/shellcheck.tar.xz" -C "$install_dir" --strip-components=1 "shellcheck-$shellcheck_version/shellcheck"
shellcheck="$install_dir/shellcheck"
"$shellcheck" --version
"$install_dir/actionlint" -shellcheck "$shellcheck"

git ls-files -z -- ':(glob)scripts/**/*.sh' ':(glob)backend/scripts/**/*.sh' |
  xargs -0 -r "$shellcheck" -x -P SCRIPTDIR --
