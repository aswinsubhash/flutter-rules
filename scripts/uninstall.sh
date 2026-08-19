#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${1:-}" == "devin" && $# -gt 1 ]]; then
  echo "Project-local Devin uninstallation is no longer supported." >&2
  echo "Devin organization skills are managed by repository connection and indexing." >&2
  exit 2
fi

exec node "$script_dir/../bin/flutter-rules.mjs" uninstall "$@"
