import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCli, parseArgs } from '../lib/cli.mjs';
import { createCommandRunner } from '../lib/command-runner.mjs';
import { installDirectory } from '../lib/fs-utils.mjs';
import { setFrontmatterFields } from '../lib/render-skill.mjs';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function fakeRunner({ available = [], responses = [] } = {}) {
  const calls = [];
  return {
    calls,
    has(command) {
      return available.includes(command);
    },
    run(command, args = []) {
      calls.push([command, ...args]);
      return responses.shift() || { code: 0, stdout: '', stderr: '' };
    },
  };
}

function tempHome() {
  return mkdtempSync(join(tmpdir(), 'flutter-rules-test-'));
}

function readExplicitSkill(path) {
  const content = readFileSync(path, 'utf8');
  assert.match(content, /^disable-model-invocation: true$/m);
  assert.match(content, /^triggers: \["user"\]$/m);
  return content;
}

test('argument parser removes dry-run flags without changing command values', () => {
  assert.deepEqual(parseArgs(['install', 'cursor', '--dry-run']), {
    values: ['install', 'cursor'],
    dryRun: true,
  });
});

test('CLI rejects unknown options and surplus arguments explicitly', async () => {
  await assert.rejects(runCli(['install', 'cursor', '--dryrun']), /Unknown option: --dryrun/);
  await assert.rejects(runCli(['install', 'cursor', 'oops']), /Unexpected argument: oops/);
});

test('frontmatter fields are bounded, replaced, and preserve BOM and CRLF', () => {
  const content = '\uFEFF---\r\nname: flutter-rules\r\ndisable-model-invocation: false\r\nmetadata:\r\n  version: 1.2.3\r\n---\r\n\r\nExample:\r\ndisable-model-invocation: true\r\n';
  const rendered = setFrontmatterFields(content, [
    'disable-model-invocation: true',
    'triggers: ["user"]',
  ]);
  assert.ok(rendered.startsWith('\uFEFF---\r\n'));
  assert.match(rendered, /^disable-model-invocation: true\r$/m);
  assert.match(rendered, /^triggers: \["user"\]\r$/m);
  assert.equal(rendered.match(/disable-model-invocation: true/g)?.length, 2);
  assert.equal(rendered.replaceAll('\r\n', '').includes('\n'), false);
});

test('frontmatter rendering rejects a missing closing delimiter even with metadata', () => {
  assert.throws(
    () => setFrontmatterFields('---\nname: flutter-rules\nmetadata:\n  version: 1.2.3\n', ['triggers: ["user"]']),
    /missing its closing delimiter/,
  );
});

test('command runner resolves and executes platform command shims', () => {
  const home = tempHome();
  const windows = process.platform === 'win32';
  const executable = join(home, windows ? 'fixture.CMD' : 'fixture');
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !['path', 'pathext'].includes(key.toLowerCase())),
  );
  env[windows ? 'path' : 'PATH'] = home;
  if (windows) env.pathext = '.CMD';
  try {
    writeFileSync(executable, windows ? '@echo off\r\n<nul set /p "=%~1"\r\n' : '#!/bin/sh\nprintf \'%s\' "$1"\n');
    if (!windows) chmodSync(executable, 0o755);
    const runner = createCommandRunner({ env });
    assert.equal(runner.has('fixture'), true);
    assert.deepEqual(runner.run('fixture', ['hello world'], { quiet: true }), {
      code: 0,
      stdout: 'hello world',
      stderr: '',
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('failed replacement restores the existing directory and removes the temporary backup', () => {
  const home = tempHome();
  const destination = join(home, 'skill');
  try {
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, 'SKILL.md'), 'old');

    assert.throws(
      () => installDirectory({
        source: join(home, 'missing-source'),
        destination,
        now: new Date('2026-08-20T00:00:00.000Z'),
      }),
      /ENOENT/,
    );

    assert.equal(readFileSync(join(destination, 'SKILL.md'), 'utf8'), 'old');
    assert.deepEqual(readdirSync(home).filter((name) => name.startsWith('skill.backup.')), []);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('setup devin redirects to user-level installation without touching the filesystem', async () => {
  const home = tempHome();
  const output = [];
  const before = readdirSync(home);
  try {
    const code = await runCli(['setup', 'devin'], {
      home,
      log: (message) => output.push(message),
    });
    assert.equal(code, 0);
    assert.match(output.join('\n'), /setup devin.*deprecated/i);
    assert.match(output.join('\n'), /flutter-rules install devin/);
    assert.doesNotMatch(output.join('\n'), /organization|cloud|index/i);
    assert.deepEqual(readdirSync(home), before);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('devin install and update replace the skill without leaving backups', async () => {
  const home = tempHome();
  const runner = fakeRunner();
  const output = [];
  const destination = join(home, '.agents', 'skills', 'flutter-rules');
  const cursorMarker = join(home, '.cursor', 'skills', 'flutter-rules', 'cursor-marker.txt');
  try {
    await runCli(['install', 'devin'], {
      home,
      runner,
      packageRoot: repoRoot,
      log: (message) => output.push(message),
    });
    assert.ok(existsSync(join(destination, 'SKILL.md')));
    readExplicitSkill(join(destination, 'SKILL.md'));
    assert.equal(existsSync(join(destination, 'agents')), false);

    await runCli(['doctor', 'devin'], { home, runner, log: (message) => output.push(message) });
    assert.match(output.join('\n'), /Devin Local skill is installed/);

    writeFileSync(join(destination, 'old-marker.txt'), 'old');
    mkdirSync(join(home, '.cursor', 'skills', 'flutter-rules'), { recursive: true });
    writeFileSync(cursorMarker, 'cursor');
    await runCli(['update', 'devin'], { home, runner, packageRoot: repoRoot });
    const backups = readdirSync(join(home, '.agents', 'skills')).filter((name) => name.startsWith('flutter-rules.backup.'));
    assert.equal(backups.length, 0);
    assert.equal(existsSync(join(destination, 'old-marker.txt')), false);
    assert.equal(readFileSync(cursorMarker, 'utf8'), 'cursor');

    await runCli(['uninstall', 'devin'], { home, runner, packageRoot: repoRoot });
    assert.equal(existsSync(destination), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('devin dry-run does not create a user skill', async () => {
  const home = tempHome();
  try {
    await runCli(['install', 'devin', '--dry-run'], { home, packageRoot: repoRoot });
    assert.equal(existsSync(join(home, '.agents')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('cursor install and update replace the skill without leaving backups', async () => {
  const home = tempHome();
  const runner = fakeRunner();
  const destination = join(home, '.cursor', 'skills', 'flutter-rules');
  const devinMarker = join(home, '.agents', 'skills', 'flutter-rules', 'devin-marker.txt');
  try {
    await runCli(['install', 'cursor'], { home, runner, packageRoot: repoRoot });
    assert.ok(existsSync(join(destination, 'SKILL.md')));
    readExplicitSkill(join(destination, 'SKILL.md'));
    assert.equal(existsSync(join(destination, 'agents')), false);

    writeFileSync(join(destination, 'old-marker.txt'), 'old');
    mkdirSync(join(home, '.agents', 'skills', 'flutter-rules'), { recursive: true });
    writeFileSync(devinMarker, 'devin');
    await runCli(['update', 'cursor'], { home, runner, packageRoot: repoRoot });
    const backups = readdirSync(join(home, '.cursor', 'skills')).filter((name) => name.startsWith('flutter-rules.backup.'));
    assert.equal(backups.length, 0);
    assert.equal(existsSync(join(destination, 'old-marker.txt')), false);
    assert.equal(readFileSync(devinMarker, 'utf8'), 'devin');

    await runCli(['uninstall', 'cursor'], { home, runner, packageRoot: repoRoot });
    assert.equal(existsSync(destination), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('filesystem rendering filters unsupported and metadata files', async () => {
  const home = tempHome();
  const packageRoot = join(home, 'package');
  const source = join(packageRoot, 'src', 'flutter-rules');
  const destination = join(home, '.cursor', 'skills', 'flutter-rules');
  try {
    mkdirSync(join(source, 'references'), { recursive: true });
    mkdirSync(join(source, 'agents'));
    writeFileSync(join(source, 'SKILL.md'), '---\nname: flutter-rules\nmetadata:\n  version: 1.2.3\n---\n');
    writeFileSync(join(source, '.DS_Store'), 'metadata');
    writeFileSync(join(source, 'extra.txt'), 'extra');
    writeFileSync(join(source, 'references', '.DS_Store'), 'metadata');
    writeFileSync(join(source, 'references', 'guide.md'), 'guide');
    writeFileSync(join(source, 'agents', 'openai.yaml'), 'agent');
    await runCli(['install', 'cursor'], { home, packageRoot });
    assert.deepEqual(readdirSync(destination).sort(), ['SKILL.md', 'references']);
    assert.deepEqual(readdirSync(join(destination, 'references')), ['guide.md']);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('failed frontmatter rendering leaves no destination or rendered directory', async () => {
  const home = tempHome();
  const packageRoot = join(home, 'package');
  const source = join(packageRoot, 'src', 'flutter-rules');
  try {
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'SKILL.md'), '---\nname: flutter-rules\nmetadata:\n  version: 1.2.3\n');
    await assert.rejects(runCli(['install', 'cursor'], { home, packageRoot }), /missing its closing delimiter/);
    assert.equal(existsSync(join(home, '.cursor')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('cursor dry-run validates and previews rendering without creating a user skill', async () => {
  const home = tempHome();
  const output = [];
  try {
    await runCli(['install', 'cursor'], {
      home,
      packageRoot: repoRoot,
      env: { FLUTTER_RULES_DRY_RUN: '1' },
      log: (message) => output.push(message),
    });
    assert.equal(existsSync(join(home, '.cursor')), false);
    assert.match(output.join('\n'), /DRY RUN: render .*src.*flutter-rules.*\.cursor.*flutter-rules/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('filesystem dry-run rejects a missing skill source', async () => {
  const home = tempHome();
  try {
    await assert.rejects(
      runCli(['install', 'cursor', '--dry-run'], { home, packageRoot: join(home, 'missing-package') }),
      /ENOENT/,
    );
    assert.equal(existsSync(join(home, '.cursor')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('dry-run previews Codex commands without invoking an injected runner', async () => {
  const calls = [];
  const output = [];
  const runner = {
    has() {
      calls.push('has');
      return true;
    },
    run() {
      calls.push('run');
      return { code: 0, stdout: '', stderr: '' };
    },
  };
  const code = await runCli(['install', 'codex', '--dry-run'], {
    runner,
    log: (message) => output.push(message),
  });
  assert.equal(code, 0);
  assert.deepEqual(calls, []);
  assert.match(output.join('\n'), /DRY RUN: codex plugin marketplace list --json/);
});

test('codex install adds a missing marketplace before installing the plugin', async () => {
  const runner = fakeRunner({
    available: ['codex'],
    responses: [
      { code: 0, stdout: JSON.stringify({ marketplaces: [] }), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    ],
  });
  await runCli(['install', 'codex'], { runner });
  assert.deepEqual(runner.calls, [
    ['codex', 'plugin', 'marketplace', 'list', '--json'],
    ['codex', 'plugin', 'marketplace', 'add', 'aswinsubhash/flutter-rules', '--ref', 'main'],
    ['codex', 'plugin', 'add', 'flutter-rules@flutter-rules'],
  ]);
});

test('codex update upgrades an existing marketplace before reinstalling the plugin', async () => {
  const runner = fakeRunner({
    available: ['codex'],
    responses: [
      { code: 0, stdout: JSON.stringify({ marketplaces: [{ name: 'flutter-rules' }] }), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    ],
  });
  await runCli(['update', 'codex'], { runner });
  assert.deepEqual(runner.calls, [
    ['codex', 'plugin', 'marketplace', 'list', '--json'],
    ['codex', 'plugin', 'marketplace', 'upgrade', 'flutter-rules'],
    ['codex', 'plugin', 'add', 'flutter-rules@flutter-rules'],
  ]);
});

test('codex refuses to replace an existing marketplace source implicitly', async () => {
  const runner = fakeRunner({
    available: ['codex'],
    responses: [
      { code: 0, stdout: JSON.stringify({ marketplaces: [{ name: 'flutter-rules' }] }), stderr: '' },
    ],
  });
  await assert.rejects(
    runCli(['update', 'codex'], {
      runner,
      env: { FLUTTER_RULES_MARKETPLACE_SOURCE: repoRoot },
    }),
    /refusing to replace its source automatically/,
  );
  assert.deepEqual(runner.calls, [['codex', 'plugin', 'marketplace', 'list', '--json']]);
});

test('codex preserves an explicit marketplace source ref', async () => {
  const runner = fakeRunner({
    available: ['codex'],
    responses: [
      { code: 0, stdout: JSON.stringify({ marketplaces: [] }), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    ],
  });
  await runCli(['install', 'codex'], {
    runner,
    env: { FLUTTER_RULES_MARKETPLACE_SOURCE: 'owner/repository@release' },
  });
  assert.deepEqual(runner.calls[1], [
    'codex',
    'plugin',
    'marketplace',
    'add',
    'owner/repository@release',
  ]);
});

test('explicit Codex install reports actionable guidance when the CLI is missing', async () => {
  await assert.rejects(
    runCli(['install', 'codex'], { runner: fakeRunner() }),
    /Codex CLI was not found.*Install Codex/i,
  );
});

test('Codex doctor reports the installed plugin from JSON output', async () => {
  const output = [];
  const runner = fakeRunner({
    available: ['codex'],
    responses: [{ code: 0, stdout: JSON.stringify({ plugins: [{ pluginId: 'flutter-rules@flutter-rules' }] }), stderr: '' }],
  });
  const code = await runCli(['doctor', 'codex'], { runner, log: (message) => output.push(message) });
  assert.equal(code, 0);
  assert.match(output.join('\n'), /Codex plugin is installed/);
  assert.deepEqual(runner.calls, [['codex', 'plugin', 'list', '--json']]);
});

test('Codex doctor ignores available, unrelated, and descriptive plugin entries', async () => {
  const output = [];
  const runner = fakeRunner({
    available: ['codex'],
    responses: [{
      code: 0,
      stdout: JSON.stringify({
        installed: [],
        available: [{ pluginId: 'flutter-rules@flutter-rules' }],
        plugins: [
          { pluginId: 'flutter-rules@another-marketplace' },
          { description: 'flutter-rules' },
        ],
      }),
      stderr: '',
    }],
  });
  await runCli(['doctor', 'codex'], { runner, log: (message) => output.push(message) });
  assert.match(output.join('\n'), /Codex plugin is not installed/);
});

test('Claude uninstall removes the plugin before its marketplace when both are present', async () => {
  const runner = fakeRunner({
    available: ['claude'],
    responses: [
      { code: 0, stdout: JSON.stringify({ plugins: [{ pluginId: 'flutter-rules@flutter-rules' }] }), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: JSON.stringify({ marketplaces: [{ name: 'flutter-rules' }] }), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    ],
  });
  await runCli(['uninstall', 'claude'], { runner });
  assert.deepEqual(runner.calls, [
    ['claude', 'plugin', 'list', '--json'],
    ['claude', 'plugin', 'uninstall', 'flutter-rules@flutter-rules', '--scope', 'user'],
    ['claude', 'plugin', 'marketplace', 'list', '--json'],
    ['claude', 'plugin', 'marketplace', 'remove', 'flutter-rules'],
  ]);
});

test('Claude uninstall preserves project-scoped plugins and their marketplace', async () => {
  const runner = fakeRunner({
    available: ['claude'],
    responses: [{
      code: 0,
      stdout: JSON.stringify([{ id: 'flutter-rules@flutter-rules', scope: 'project' }]),
      stderr: '',
    }],
  });
  await runCli(['uninstall', 'claude'], { runner });
  assert.deepEqual(runner.calls, [['claude', 'plugin', 'list', '--json']]);
});

test('claude update refreshes the marketplace and installed user plugin', async () => {
  const runner = fakeRunner({
    available: ['claude'],
    responses: [
      { code: 0, stdout: JSON.stringify({ marketplaces: [{ name: 'flutter-rules' }] }), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: JSON.stringify([{ id: 'flutter-rules@flutter-rules', scope: 'user' }]), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    ],
  });
  await runCli(['update', 'claude'], { runner });
  assert.deepEqual(runner.calls, [
    ['claude', 'plugin', 'marketplace', 'list', '--json'],
    ['claude', 'plugin', 'marketplace', 'update', 'flutter-rules'],
    ['claude', 'plugin', 'list', '--json'],
    ['claude', 'plugin', 'update', 'flutter-rules@flutter-rules', '--scope', 'user'],
  ]);
});

test('claude update installs user scope when the plugin exists only at project scope', async () => {
  const runner = fakeRunner({
    available: ['claude'],
    responses: [
      { code: 0, stdout: JSON.stringify({ marketplaces: [{ name: 'flutter-rules' }] }), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: JSON.stringify([{ id: 'flutter-rules@flutter-rules', scope: 'project' }]), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    ],
  });
  await runCli(['update', 'claude'], { runner });
  assert.deepEqual(runner.calls.at(-1), [
    'claude',
    'plugin',
    'install',
    'flutter-rules@flutter-rules',
    '--scope',
    'user',
  ]);
});

test('claude update installs a missing plugin from the configured source override', async () => {
  const runner = fakeRunner({
    available: ['claude'],
    responses: [
      { code: 0, stdout: JSON.stringify({ marketplaces: [] }), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: JSON.stringify([]), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    ],
  });
  await runCli(['update', 'claude'], {
    runner,
    env: { FLUTTER_RULES_CODEX_MARKETPLACE_SOURCE: repoRoot },
  });
  assert.deepEqual(runner.calls, [
    ['claude', 'plugin', 'marketplace', 'list', '--json'],
    ['claude', 'plugin', 'marketplace', 'add', repoRoot],
    ['claude', 'plugin', 'list', '--json'],
    ['claude', 'plugin', 'install', 'flutter-rules@flutter-rules', '--scope', 'user'],
  ]);
});

test('claude refuses to replace an existing marketplace source implicitly', async () => {
  const runner = fakeRunner({
    available: ['claude'],
    responses: [{
      code: 0,
      stdout: JSON.stringify({ marketplaces: [{ name: 'flutter-rules' }] }),
      stderr: '',
    }],
  });
  await assert.rejects(
    runCli(['update', 'claude'], {
      runner,
      env: { FLUTTER_RULES_MARKETPLACE_SOURCE: repoRoot },
    }),
    /refusing to replace its source automatically/,
  );
  assert.deepEqual(runner.calls, [['claude', 'plugin', 'marketplace', 'list', '--json']]);
});

test('all continues after missing CLIs and reports a failed aggregate result', async () => {
  const home = tempHome();
  const errors = [];
  const runner = fakeRunner();
  try {
    const code = await runCli(['install', 'all'], {
      home,
      runner,
      packageRoot: repoRoot,
      error: (message) => errors.push(message),
    });
    assert.equal(code, 1);
    assert.equal(errors.length, 2);
    const cursorSkill = join(home, '.cursor', 'skills', 'flutter-rules', 'SKILL.md');
    const devinSkill = join(home, '.agents', 'skills', 'flutter-rules', 'SKILL.md');
    assert.equal(readExplicitSkill(cursorSkill), readExplicitSkill(devinSkill));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('filesystem doctors report synchronized copies and actionable drift', async () => {
  const home = tempHome();
  const runner = fakeRunner();
  const cursorSkill = join(home, '.cursor', 'skills', 'flutter-rules', 'SKILL.md');
  const devinSkill = join(home, '.agents', 'skills', 'flutter-rules', 'SKILL.md');
  try {
    await runCli(['install', 'cursor'], { home, runner, packageRoot: repoRoot });
    await runCli(['install', 'devin'], { home, runner, packageRoot: repoRoot });

    const synchronized = [];
    await runCli(['doctor', 'cursor'], { home, runner, log: (message) => synchronized.push(message) });
    await runCli(['doctor', 'devin'], { home, runner, log: (message) => synchronized.push(message) });
    assert.match(synchronized.join('\n'), /copies are synchronized/);
    assert.match(synchronized.join('\n'), /shared \.agents path/);

    const original = readFileSync(devinSkill, 'utf8');
    const unquotedVersion = original.replace(/version: "([^"]+)"/, 'version: $1');
    writeFileSync(cursorSkill, unquotedVersion);
    writeFileSync(devinSkill, unquotedVersion);
    const unquoted = [];
    await runCli(['doctor', 'cursor'], { home, runner, log: (message) => unquoted.push(message) });
    assert.match(unquoted.join('\n'), /copies are synchronized/);

    const missingVersion = original.replace(/^\s+version:.*\n/m, '');
    writeFileSync(cursorSkill, missingVersion);
    writeFileSync(devinSkill, missingVersion);
    const missing = [];
    await runCli(['doctor', 'cursor'], { home, runner, log: (message) => missing.push(message) });
    assert.match(missing.join('\n'), /version metadata is missing.*update all/i);

    writeFileSync(cursorSkill, original);
    const bodyOnlyTrigger = `${original.replace('triggers: ["user"]\n', '')}\ntriggers: ["user"]\n`;
    writeFileSync(devinSkill, bodyOnlyTrigger);
    const bodyMetadata = [];
    await runCli(['doctor', 'cursor'], { home, runner, log: (message) => bodyMetadata.push(message) });
    assert.match(bodyMetadata.join('\n'), /invocation metadata differ.*update all/i);

    writeFileSync(devinSkill, original.replace('triggers: ["user"]\n', ''));
    const metadataDrift = [];
    await runCli(['doctor', 'cursor'], { home, runner, log: (message) => metadataDrift.push(message) });
    assert.match(metadataDrift.join('\n'), /invocation metadata differ.*update all/i);

    writeFileSync(devinSkill, original.replace(/version: "[^"]+"/, 'version: "0.0.0"'));
    const versionDrift = [];
    await runCli(['doctor', 'cursor'], { home, runner, log: (message) => versionDrift.push(message) });
    assert.match(versionDrift.join('\n'), /versions differ.*update all/i);

    writeFileSync(devinSkill, `${original}\n`);
    const contentDrift = [];
    await runCli(['doctor', 'devin'], { home, runner, log: (message) => contentDrift.push(message) });
    assert.match(contentDrift.join('\n'), /copies differ.*update all/i);
    assert.ok(existsSync(cursorSkill));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('version is synchronized across package, canonical skill, manifests, and generated skills', () => {
  const version = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version;
  const files = [
    'src/flutter-rules/SKILL.md',
    'plugins/flutter-rules/.codex-plugin/plugin.json',
    'claude-plugins/flutter-rules/.claude-plugin/plugin.json',
    '.agents/skills/flutter-rules/SKILL.md',
    '.devin/skills/flutter-rules/SKILL.md',
    'plugins/flutter-rules/skills/flutter-rules/SKILL.md',
    'claude-plugins/flutter-rules/skills/flutter-rules/SKILL.md',
  ];
  for (const file of files) {
    const content = readFileSync(join(repoRoot, file), 'utf8');
    assert.match(content, new RegExp(`version["']?: ["']${version.replaceAll('.', '\\.')}`));
  }
});
