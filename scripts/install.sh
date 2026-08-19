#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${1:-}" == "devin" && $# -gt 1 ]]; then
  echo "Project-local Devin installation is no longer supported." >&2
  echo "Run: npx @aswinsubhash/flutter-rules@latest setup devin" >&2
  exit 2
fi

exec node "$script_dir/../bin/flutter-rules.mjs" install "$@"
