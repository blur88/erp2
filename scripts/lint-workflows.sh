#!/usr/bin/env bash
# Lint workflows with pinned actionlint and shell scripts with ShellCheck (#1898, #1939).
set -euo pipefail

command -v shellcheck >/dev/null
install_dir=$(mktemp -d)
trap 'rm -rf "$install_dir"' EXIT
curl -fsSL https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz \
  -o "$install_dir/actionlint.tar.gz"
echo "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8  $install_dir/actionlint.tar.gz" | sha256sum --check --status
tar -xzf "$install_dir/actionlint.tar.gz" -C "$install_dir" actionlint
"$install_dir/actionlint" -shellcheck "$(command -v shellcheck)"

git ls-files -z -- ':(glob)scripts/**/*.sh' ':(glob)backend/scripts/**/*.sh' |
  xargs -0 -r shellcheck -x -P SCRIPTDIR --
