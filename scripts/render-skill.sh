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

mkdir -p "$destination/references"
cp "$source_dir/SKILL.md" "$destination/SKILL.md"
cp -R "$source_dir/references/." "$destination/references/"

if [[ "$platform" == "codex" ]]; then
  mkdir -p "$destination/agents"
  cp "$source_dir/agents/openai.yaml" "$destination/agents/openai.yaml"
  exit 0
fi

case "$platform" in
  claude|cursor)
    platform_field="disable-model-invocation: true"
    ;;
  devin)
    platform_field='triggers: ["user"]'
    ;;
esac

temporary_file="$destination/SKILL.md.tmp"
awk -v field="$platform_field" '
  NR == 1 && $0 == "---" {
    in_frontmatter = 1
    print
    next
  }
  in_frontmatter && !inserted && $0 ~ /^metadata:/ {
    print field
    inserted = 1
  }
  in_frontmatter && !inserted && $0 == "---" {
    print field
    inserted = 1
    in_frontmatter = 0
  }
  { print }
' "$destination/SKILL.md" > "$temporary_file"
mv "$temporary_file" "$destination/SKILL.md"
