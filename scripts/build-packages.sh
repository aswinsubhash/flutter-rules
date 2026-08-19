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
  node --input-type=module - "$platform_root" "$output_root/flutter-rules-$platform.tar.gz" <<'NODE'
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { create } from 'tar';

const [root, file] = process.argv.slice(2);
const directory = join(root, 'flutter-rules');
const entries = ['flutter-rules'];
const collect = async (path) => {
  const children = await readdir(path, { withFileTypes: true });
  children.sort((left, right) => left.name.localeCompare(right.name));
  for (const child of children) {
    const childPath = join(path, child.name);
    entries.push(relative(root, childPath));
    if (child.isDirectory()) await collect(childPath);
  }
};
await collect(directory);
await create({
  cwd: root,
  file,
  gzip: true,
  mtime: new Date('1985-10-26T08:15:00.000Z'),
  noDirRecurse: true,
  portable: true,
}, entries);
NODE
done

echo "Built packages in $output_root"
