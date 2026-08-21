#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
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
  'lib/legacy-cleanup.mjs',
  'lib/skill-inspector.mjs',
  'lib/skills-manager.mjs',
  'src/flutter-rules/SKILL.md',
  'src/flutter-rules/agents/openai.yaml',
  'src/flutter-rules/references/api.md',
  'src/flutter-rules/references/architecture.md',
  'src/flutter-rules/references/dart.md',
  'src/flutter-rules/references/dart3.md',
  'src/flutter-rules/references/flutter-errors.md',
  'src/flutter-rules/references/localization.md',
  'src/flutter-rules/references/navigation.md',
  'src/flutter-rules/references/quality.md',
  'src/flutter-rules/references/review.md',
  'src/flutter-rules/references/state.md',
  'src/flutter-rules/references/testing.md',
  'src/flutter-rules/references/ui.md',
  'src/flutter-rules/schemas/review-report.schema.json',
  'src/flutter-rules/scripts/render-review-report.mjs',
  'src/flutter-rules/assets/review-report.css',
  'src/flutter-rules/assets/review-report.js',
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
  file === 'src/flutter-rules/SKILL.md' ||
  file === 'src/flutter-rules/agents/openai.yaml' ||
  /^src\/flutter-rules\/references\/[^/]+\.md$/.test(file) ||
  /^src\/flutter-rules\/schemas\/[^/]+\.json$/.test(file) ||
  /^src\/flutter-rules\/scripts\/[^/]+\.mjs$/.test(file) ||
  /^src\/flutter-rules\/assets\/[^/]+\.(css|js)$/.test(file);

for (const file of files) assert.ok(allowed(file), `Unexpected package file ${file}`);
console.log(`Package contents verified (${files.length} files).`);
