#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || 'npm pack --dry-run failed.\n');
  process.exit(result.status || 1);
}

const metadata = JSON.parse(result.stdout);
const files = metadata[0]?.files?.map(({ path }) => path) ?? [];
const required = [
  'bin/flutter-rules.mjs',
  'lib/cli.mjs',
  'lib/command-runner.mjs',
  'lib/fs-utils.mjs',
  'lib/render-skill.mjs',
  'src/flutter-rules/SKILL.md',
  'README.md',
  'LICENSE',
];

for (const file of required) assert.ok(files.includes(file), `Package is missing ${file}`);

const allowed = (file) =>
  file === 'package.json' ||
  file === 'README.md' ||
  file === 'LICENSE' ||
  file.startsWith('bin/') ||
  file.startsWith('lib/') ||
  file.startsWith('src/flutter-rules/');

for (const file of files) assert.ok(allowed(file), `Unexpected package file ${file}`);
console.log(`Package contents verified (${files.length} files).`);
