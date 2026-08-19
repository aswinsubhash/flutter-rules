import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCli, parseArgs } from '../lib/cli.mjs';

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

test('devin install, update, backup, doctor, and uninstall are safe', async () => {
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
    assert.equal(backups.length, 1);
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

test('cursor install, update, backup, and uninstall are safe', async () => {
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
    assert.equal(backups.length, 1);
    assert.equal(existsSync(join(destination, 'old-marker.txt')), false);
    assert.equal(readFileSync(devinMarker, 'utf8'), 'devin');

    await runCli(['uninstall', 'cursor'], { home, runner, packageRoot: repoRoot });
    assert.equal(existsSync(destination), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('cursor dry-run does not create a user skill', async () => {
  const home = tempHome();
  const runner = fakeRunner();
  try {
    await runCli(['install', 'cursor'], {
      home,
      runner,
      packageRoot: repoRoot,
      env: { FLUTTER_RULES_DRY_RUN: '1' },
    });
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

test('claude update refreshes the marketplace and user plugin', async () => {
  const runner = fakeRunner({
    available: ['claude'],
    responses: [
      { code: 0, stdout: JSON.stringify({ marketplaces: [{ name: 'flutter-rules' }] }), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    ],
  });
  await runCli(['update', 'claude'], { runner });
  assert.deepEqual(runner.calls, [
    ['claude', 'plugin', 'marketplace', 'list', '--json'],
    ['claude', 'plugin', 'marketplace', 'update', 'flutter-rules'],
    ['claude', 'plugin', 'update', 'flutter-rules@flutter-rules', '--scope', 'user'],
  ]);
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
