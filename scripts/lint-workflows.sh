#!/usr/bin/env bash
# Lint workflows and shell scripts with pinned actionlint and ShellCheck (#1983).
set -euo pipefail

platform="$(uname -s)/$(uname -m)"
if [[ "$platform" != Linux/x86_64 ]]; then
  echo "error: unsupported platform $platform; workflow lint requires Linux/x86_64." >&2
  exit 1
fi
install_dir=$(mktemp -d)
trap 'rm -rf "$install_dir"' EXIT
curl -fsSL https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz \
  -o "$install_dir/actionlint.tar.gz"
echo "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8  $install_dir/actionlint.tar.gz" | sha256sum --check --quiet
tar -xzf "$install_dir/actionlint.tar.gz" -C "$install_dir" actionlint

shellcheck_version=v0.11.0
shellcheck_member="shellcheck-$shellcheck_version/shellcheck"
curl -fsSL "https://github.com/koalaman/shellcheck/releases/download/$shellcheck_version/shellcheck-$shellcheck_version.linux.x86_64.tar.gz" \
  -o "$install_dir/shellcheck.tar.gz"
echo "b7af85e41cc99489dcc21d66c6d5f3685138f06d34651e6d34b42ec6d54fe6f6  $install_dir/shellcheck.tar.gz" | sha256sum --check --quiet
tar -xzf "$install_dir/shellcheck.tar.gz" -C "$install_dir" "$shellcheck_member"
shellcheck_path="$install_dir/$shellcheck_member"

"$install_dir/actionlint" -shellcheck "$shellcheck_path"

git ls-files -z -- setup.sh deploy.sh ':(glob)scripts/**/*.sh' ':(glob)backend/scripts/**/*.sh' |
  xargs -0 -r "$shellcheck_path" -x -P SCRIPTDIR --
