#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <codex|claude|cursor|devin|all> [/path/to/devin-project]" >&2
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 2
fi

target="$1"
project_path="${2:-}"
install_home="${FLUTTER_RULES_INSTALL_HOME:-$HOME}"
dry_run="${FLUTTER_RULES_DRY_RUN:-0}"

run() {
  if [[ "$dry_run" == "1" ]]; then
    printf 'DRY RUN:'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

remove_directory_skill() {
  local destination="$1"
  case "$destination" in
    "$install_home/.claude/skills/flutter-rules"|\
    "$install_home/.cursor/skills/flutter-rules"|\
    */.devin/skills/flutter-rules) ;;
    *)
      echo "Refusing to remove unexpected path: $destination" >&2
      exit 1
      ;;
  esac

  if [[ -e "$destination" || -L "$destination" ]]; then
    run rm -rf -- "$destination"
    echo "Removed $destination"
  else
    echo "Not installed: $destination"
  fi
}

remove_codex_plugin() {
  command -v codex >/dev/null 2>&1 || {
    echo "Codex CLI is required to remove the Codex plugin." >&2
    exit 1
  }
  run codex plugin remove flutter-rules@flutter-rules
  run codex plugin marketplace remove flutter-rules
}

case "$target" in
  codex)
    remove_codex_plugin
    ;;
  claude)
    remove_directory_skill "$install_home/.claude/skills/flutter-rules"
    ;;
  cursor)
    remove_directory_skill "$install_home/.cursor/skills/flutter-rules"
    ;;
  devin)
    if [[ -z "$project_path" ]]; then
      usage
      exit 2
    fi
    project_path="$(cd -- "$project_path" && pwd)"
    remove_directory_skill "$project_path/.devin/skills/flutter-rules"
    ;;
  all)
    remove_codex_plugin
    remove_directory_skill "$install_home/.claude/skills/flutter-rules"
    remove_directory_skill "$install_home/.cursor/skills/flutter-rules"
    ;;
  *)
    usage
    exit 2
    ;;
esac
