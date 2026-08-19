#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${1:-}" == "devin" && $# -gt 1 ]]; then
  echo "A custom Devin destination is not supported." >&2
  echo "Run: npx @aswinsubhash/flutter-rules@latest uninstall devin" >&2
  exit 2
fi

exec node "$script_dir/../bin/flutter-rules.mjs" uninstall "$@"
