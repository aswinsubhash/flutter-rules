#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
output_root="${1:-$repo_root/dist}"

if [[ -e "$output_root" ]]; then
  if [[ "$output_root" != "$repo_root/dist" ]]; then
    echo "Custom output path already exists: $output_root" >&2
    exit 1
  fi
  rm -rf -- "$output_root"
fi

mkdir -p "$output_root"

for platform in codex claude cursor devin; do
  platform_root="$output_root/$platform"
  "$script_dir/render-skill.sh" "$platform" "$platform_root/flutter-rules"
  tar -czf "$output_root/flutter-rules-$platform.tar.gz" \
    -C "$platform_root" flutter-rules
done

echo "Built packages in $output_root"
