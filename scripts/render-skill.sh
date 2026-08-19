#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <codex|claude|cursor|devin> <destination>" >&2
}

if [[ $# -ne 2 ]]; then
  usage
  exit 2
fi

platform="$1"
destination="$2"

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
source_dir="$repo_root/src/flutter-rules"

case "$platform" in
  codex|claude|cursor|devin) ;;
  *)
    usage
    exit 2
    ;;
esac

if [[ -e "$destination" ]]; then
  echo "Destination already exists: $destination" >&2
  exit 1
fi

exec node "$repo_root/lib/render-skill.mjs" "$source_dir" "$platform" "$destination"
