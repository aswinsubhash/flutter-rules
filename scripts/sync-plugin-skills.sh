#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
mode="${1:-write}"

if [[ "$mode" != "write" && "$mode" != "--check" ]]; then
  echo "Usage: $0 [--check]" >&2
  exit 2
fi

temporary_root="$(mktemp -d)"
trap 'rm -rf -- "$temporary_root"' EXIT

"$script_dir/render-skill.sh" codex "$temporary_root/codex"
"$script_dir/render-skill.sh" claude "$temporary_root/claude"
"$script_dir/render-skill.sh" devin "$temporary_root/devin"

codex_destination="$repo_root/plugins/flutter-rules/skills/flutter-rules"
claude_destination="$repo_root/claude-plugins/flutter-rules/skills/flutter-rules"
devin_destination="$repo_root/.devin/skills/flutter-rules"

if [[ "$mode" == "--check" ]]; then
  diff -ru "$temporary_root/codex" "$codex_destination"
  diff -ru "$temporary_root/claude" "$claude_destination"
  diff -ru "$temporary_root/devin" "$devin_destination"
  exit 0
fi

for destination in "$codex_destination" "$claude_destination" "$devin_destination"; do
  case "$destination" in
    "$repo_root/plugins/flutter-rules/skills/flutter-rules"|\
    "$repo_root/claude-plugins/flutter-rules/skills/flutter-rules"|\
    "$repo_root/.devin/skills/flutter-rules") ;;
    *)
      echo "Refusing to replace unexpected path: $destination" >&2
      exit 1
      ;;
  esac
  rm -rf -- "$destination"
  mkdir -p "$(dirname -- "$destination")"
done

cp -R "$temporary_root/codex" "$codex_destination"
cp -R "$temporary_root/claude" "$claude_destination"
cp -R "$temporary_root/devin" "$devin_destination"
