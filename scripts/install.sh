#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./scripts/install.sh codex
  ./scripts/install.sh claude
  ./scripts/install.sh cursor
  ./scripts/install.sh devin /path/to/project
  ./scripts/install.sh all

Set FLUTTER_RULES_DRY_RUN=1 to print actions without changing anything.
Set FLUTTER_RULES_INSTALL_HOME to override the user home during testing.
Set FLUTTER_RULES_CODEX_MARKETPLACE_SOURCE to override the Codex marketplace source.
EOF
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 2
fi

target="$1"
project_path="${2:-}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
install_home="${FLUTTER_RULES_INSTALL_HOME:-$HOME}"
dry_run="${FLUTTER_RULES_DRY_RUN:-0}"
temporary_root="$(mktemp -d)"
trap 'rm -rf -- "$temporary_root"' EXIT

run() {
  if [[ "$dry_run" == "1" ]]; then
    printf 'DRY RUN:'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

install_directory_skill() {
  local platform="$1"
  local destination="$2"
  local rendered="$temporary_root/$platform/flutter-rules"
  local backup

  mkdir -p "$(dirname -- "$rendered")"
  "$script_dir/render-skill.sh" "$platform" "$rendered"

  if [[ -e "$destination" || -L "$destination" ]]; then
    backup="$destination.backup.$(date -u +%Y%m%d%H%M%S)"
    run mv "$destination" "$backup"
    echo "Backed up existing skill to $backup"
  fi

  run mkdir -p "$(dirname -- "$destination")"
  run cp -R "$rendered" "$destination"
  echo "Installed $platform skill at $destination"
}

install_codex_plugin() {
  local source="${FLUTTER_RULES_CODEX_MARKETPLACE_SOURCE:-aswinsubhash/flutter-rules}"
  command -v codex >/dev/null 2>&1 || {
    echo "Codex CLI is required for the Codex plugin installation." >&2
    exit 1
  }

  if [[ "$dry_run" == "1" ]]; then
    if [[ -d "$source" ]]; then
      run codex plugin marketplace add "$source"
    else
      run codex plugin marketplace add "$source" --ref main
    fi
  elif codex plugin marketplace list --json | python3 -c '
import json
import sys

payload = json.load(sys.stdin)
raise SystemExit(0 if any(item.get("name") == "flutter-rules" for item in payload.get("marketplaces", [])) else 1)
'; then
    if [[ -d "$source" ]]; then
      echo "Codex marketplace flutter-rules is already configured."
    else
      run codex plugin marketplace upgrade flutter-rules
    fi
  elif [[ -d "$source" ]]; then
    run codex plugin marketplace add "$source"
  else
    run codex plugin marketplace add "$source" --ref main
  fi

  run codex plugin add flutter-rules@flutter-rules
  echo "Installed the Codex plugin from $source"
}

case "$target" in
  codex)
    install_codex_plugin
    ;;
  claude)
    install_directory_skill claude "$install_home/.claude/skills/flutter-rules"
    ;;
  cursor)
    install_directory_skill cursor "$install_home/.cursor/skills/flutter-rules"
    ;;
  devin)
    if [[ -z "$project_path" ]]; then
      echo "Devin installation requires a target project path." >&2
      usage
      exit 2
    fi
    project_path="$(cd -- "$project_path" && pwd)"
    install_directory_skill devin "$project_path/.devin/skills/flutter-rules"
    ;;
  all)
    if [[ -n "$project_path" ]]; then
      echo "The all target does not accept a project path; install Devin separately." >&2
      exit 2
    fi
    install_codex_plugin
    install_directory_skill claude "$install_home/.claude/skills/flutter-rules"
    install_directory_skill cursor "$install_home/.cursor/skills/flutter-rules"
    echo "For Devin, connect this repository or run: $0 devin /path/to/project"
    ;;
  *)
    usage
    exit 2
    ;;
esac
