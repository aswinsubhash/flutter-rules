import assert from 'node:assert/strict';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCli, parseArgs } from '../lib/cli.mjs';
import { createCommandRunner } from '../lib/command-runner.mjs';
import { cleanupLegacy, inspectLegacy } from '../lib/legacy-cleanup.mjs';
import { inspectAdapterPath, inspectSkillDirectory, isOwnedSkillDirectory } from '../lib/skill-inspector.mjs';
import { createSkillsManager, resolveSkillsCliPath, skillSource, sourceStatus } from '../lib/skills-manager.mjs';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageVersion = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version;

function tempHome() {
  return mkdtempSync(join(tmpdir(), 'flutter-rules-test-'));
}

function fakeRunner({ available = [], responses = [], onRun } = {}) {
  const calls = [];
  return {
    calls,
    dryRun: false,
    has(command) {
      return available.includes(command);
    },
    run(command, args = [], options = {}) {
      calls.push({ command, args, options });
      onRun?.({ command, args, options, index: calls.length - 1 });
      return responses.shift() || { code: 0, stdout: '', stderr: '' };
    },
  };
}

function copyCanonical(home, destination = join(home, '.agents', 'skills', 'flutter-rules')) {
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(join(repoRoot, 'src', 'flutter-rules'), destination, { recursive: true });
  return destination;
}

function managerEntry(source, agents = ['Codex']) {
  return {
    name: 'flutter-rules',
    path: join('/tmp', '.agents', 'skills', 'flutter-rules'),
    scope: 'global',
    agents,
    source,
    sourceUrl: source,
    sourceType: 'local',
  };
}

function pinnedEntry(ref, source = 'aswinsubhash/flutter-rules') {
  return { ...managerEntry(source), ref };
}

function runOptions(home, runner, output = [], errors = []) {
  return {
    home,
    runner,
    packageRoot: repoRoot,
    env: {
      ...process.env,
      FLUTTER_RULES_SKILL_SOURCE: 'test-source',
    },
    log: (message) => output.push(message),
    error: (message) => errors.push(message),
  };
}

test('argument parser recognizes dry-run and JSON flags', () => {
  assert.deepEqual(parseArgs(['doctor', '--json']), {
    values: ['doctor'],
    dryRun: false,
    json: true,
  });
  assert.deepEqual(parseArgs(['install', '--dry-run']), {
    values: ['install'],
    dryRun: true,
    json: false,
  });
});

test('CLI rejects unknown flags and extra arguments', async () => {
  await assert.rejects(runCli(['install', '--dryrun']), /Unknown option: --dryrun/);
  await assert.rejects(runCli(['install', 'claude', 'extra']), /Unexpected argument: extra/);
  await assert.rejects(runCli(['install', '--json']), /only supported with `doctor`/);
  await assert.rejects(runCli(['doctor', '--dry-run']), /not supported with `doctor`/);
});

test('command runner resolves platform shims and rejects directories', () => {
  const home = tempHome();
  const windows = process.platform === 'win32';
  const executable = join(home, windows ? 'fixture.CMD' : 'fixture');
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !['path', 'pathext'].includes(key.toLowerCase())),
  );
  env[windows ? 'path' : 'PATH'] = home;
  if (windows) env.pathext = '.CMD';
  try {
    writeFileSync(executable, windows ? '@echo off\r\n<nul set /p "=%~1"\r\nexit /b 0\r\n' : '#!/bin/sh\nprintf \'%s\' "$1"\n');
    if (!windows) chmodSync(executable, 0o755);
    mkdirSync(join(home, 'directory-command'));
    const runner = createCommandRunner({ env });
    assert.equal(runner.has('fixture'), true);
    assert.equal(runner.has('directory-command'), false);
    assert.deepEqual(runner.run('fixture', ['hello world'], { quiet: true }), {
      code: 0,
      stdout: 'hello world',
      stderr: '',
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('canonical skill is explicit-only, owned, versioned, and policy-safe', () => {
  const inspection = inspectSkillDirectory(join(repoRoot, 'src', 'flutter-rules'), packageVersion);
  assert.equal(inspection.healthy, true);
  assert.equal(inspection.version, packageVersion);
  assert.equal(inspection.policyValid, true);
  assert.equal(isOwnedSkillDirectory(join(repoRoot, 'src', 'flutter-rules')), true);
});

test('skill inspector rejects stale versions and duplicate policy sections', () => {
  const home = tempHome();
  const destination = copyCanonical(home);
  try {
    const skillPath = join(destination, 'SKILL.md');
    writeFileSync(skillPath, readFileSync(skillPath, 'utf8').replace(`version: "${packageVersion}"`, 'version: "1.0.0"'));
    assert.match(inspectSkillDirectory(destination, packageVersion).issues.join(' '), /Installed version 1\.0\.0 does not match/);
    writeFileSync(join(destination, 'agents', 'openai.yaml'), 'policy:\n  allow_implicit_invocation: false\npolicy:\n  allow_implicit_invocation: true\n');
    assert.equal(inspectSkillDirectory(destination, '1.0.0').policyValid, false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Skills manager resolves pinned CLI and builds deterministic commands', () => {
  const runner = fakeRunner({
    responses: [{ code: 0, stdout: '', stderr: '' }],
  });
  const manager = createSkillsManager({
    runner,
    version: '2.0.0',
    env: { FLUTTER_RULES_SKILL_SOURCE: 'owner/repo#branch' },
  });
  manager.installShared();
  assert.equal(manager.source, 'owner/repo#branch');
  assert.equal(runner.calls[0].command, process.execPath);
  assert.equal(runner.calls[0].args[0], resolveSkillsCliPath());
  assert.deepEqual(runner.calls[0].args.slice(1), [
    'add', 'owner/repo#branch',
    '--skill', 'flutter-rules',
    '--agent', 'codex',
    '--global',
    '--yes',
  ]);
  assert.equal(skillSource('2.0.0', {}), 'aswinsubhash/flutter-rules#v2.0.0');
});

test('source validation compares GitHub repository and ref separately', () => {
  assert.deepEqual(
    sourceStatus(
      {
        source: 'aswinsubhash/flutter-rules',
        sourceUrl: 'https://github.com/aswinsubhash/flutter-rules.git',
        ref: 'v2.0.0',
      },
      'aswinsubhash/flutter-rules#v2.0.0',
    ),
    {
      owned: true,
      current: true,
      source: 'aswinsubhash/flutter-rules',
      ref: 'v2.0.0',
      local: false,
    },
  );
  assert.deepEqual(
    sourceStatus(
      { source: 'aswinsubhash/flutter-rules', ref: 'v1.1.2' },
      'aswinsubhash/flutter-rules#v2.0.0',
    ),
    {
      owned: true,
      current: false,
      source: 'aswinsubhash/flutter-rules',
      ref: 'v1.1.2',
      local: false,
    },
  );
  assert.deepEqual(
    sourceStatus(
      { source: 'someone-else/flutter-rules', ref: 'v2.0.0' },
      'aswinsubhash/flutter-rules#v2.0.0',
    ),
    {
      owned: false,
      current: false,
      source: 'aswinsubhash/flutter-rules',
      ref: 'v2.0.0',
      local: false,
    },
  );
});

test('Skills manager rejects malformed list JSON', () => {
  const runner = fakeRunner({ responses: [{ code: 0, stdout: 'not-json', stderr: '' }] });
  const manager = createSkillsManager({ runner, version: packageVersion, env: {} });
  assert.throws(() => manager.list(), /Could not parse Skills CLI JSON output/);
});

test('Skills manager reads source metadata from XDG state lock', () => {
  const home = tempHome();
  const stateHome = join(home, 'state');
  const lockDirectory = join(stateHome, 'skills');
  mkdirSync(lockDirectory, { recursive: true });
  writeFileSync(join(lockDirectory, '.skill-lock.json'), JSON.stringify({
    version: 3,
    skills: {
      'flutter-rules': {
        source: 'aswinsubhash/flutter-rules',
        sourceUrl: 'https://github.com/aswinsubhash/flutter-rules.git',
        ref: 'v2.0.0',
      },
    },
  }));
  const runner = fakeRunner({
    responses: [{ code: 0, stdout: JSON.stringify([{ name: 'flutter-rules' }]), stderr: '' }],
  });
  try {
    const manager = createSkillsManager({
      runner,
      version: '2.0.0',
      env: { HOME: home, XDG_STATE_HOME: stateHome },
    });
    const entry = manager.find();
    assert.equal(entry.source, 'aswinsubhash/flutter-rules');
    assert.equal(entry.ref, 'v2.0.0');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('targetless install verifies the canonical skill and source', async () => {
  const home = tempHome();
  const output = [];
  const errors = [];
  copyCanonical(home);
  const runner = fakeRunner({
    responses: [
      { code: 0, stdout: JSON.stringify([managerEntry('test-source')]), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: JSON.stringify([managerEntry('test-source')]), stderr: '' },
    ],
  });
  try {
    assert.equal(await runCli(['install'], runOptions(home, runner, output, errors)), 0);
    assert.match(output.join('\n'), new RegExp(`Installed Flutter Rules ${packageVersion.replaceAll('.', '\\.')}`));
    assert.equal(errors.length, 0);
    assert.deepEqual(runner.calls[1].args.slice(1, 4), ['add', 'test-source', '--skill']);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('dry-run prints Skills CLI action without verification or writes', async () => {
  const home = tempHome();
  const output = [];
  const runner = fakeRunner();
  runner.dryRun = true;
  try {
    assert.equal(await runCli(['install', '--dry-run'], runOptions(home, runner, output)), 0);
    assert.match(output.join('\n'), /Would install Flutter Rules globally/);
    assert.equal(existsSync(join(home, '.agents')), false);
    assert.equal(runner.calls.length, 2);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('dry-run previews legacy cleanup without removing files', async () => {
  const home = tempHome();
  const output = [];
  const legacy = copyCanonical(home, join(home, '.cursor', 'skills', 'flutter-rules'));
  const runner = fakeRunner();
  runner.dryRun = true;
  try {
    assert.equal(await runCli(['install', '--dry-run'], runOptions(home, runner, output)), 0);
    assert.match(output.join('\n'), /Would remove 1 legacy Flutter Rules artifact/);
    assert.equal(existsSync(legacy), true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('install failure prevents legacy cleanup', async () => {
  const home = tempHome();
  const legacy = join(home, '.cursor', 'skills', 'flutter-rules');
  copyCanonical(home, legacy);
  const runner = fakeRunner({
    available: ['codex'],
    responses: [
      { code: 0, stdout: '[]', stderr: '' },
      { code: 1, stdout: '', stderr: 'network failed' },
    ],
  });
  try {
    await assert.rejects(runCli(['install'], runOptions(home, runner)), /network failed/);
    assert.equal(existsSync(legacy), true);
    assert.equal(runner.calls.length, 2);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('install refuses to overwrite an unrecognized canonical skill', async () => {
  const home = tempHome();
  const canonical = join(home, '.agents', 'skills', 'flutter-rules');
  mkdirSync(canonical, { recursive: true });
  writeFileSync(join(canonical, 'SKILL.md'), 'foreign');
  const runner = fakeRunner({ responses: [{ code: 0, stdout: '[]', stderr: '' }] });
  try {
    await assert.rejects(runCli(['install'], runOptions(home, runner)), /Refusing to modify an unrecognized skill/);
    assert.equal(runner.calls.length, 1);
    assert.equal(readFileSync(join(canonical, 'SKILL.md'), 'utf8'), 'foreign');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('uninstall refuses to remove an unrecognized Claude integration', async () => {
  const home = tempHome();
  copyCanonical(home);
  const claudePath = join(home, '.claude', 'skills', 'flutter-rules');
  mkdirSync(claudePath, { recursive: true });
  writeFileSync(join(claudePath, 'SKILL.md'), 'foreign');
  const runner = fakeRunner({
    responses: [{ code: 0, stdout: JSON.stringify([managerEntry('test-source')]), stderr: '' }],
  });
  try {
    await assert.rejects(runCli(['uninstall'], runOptions(home, runner)), /Refusing to modify an unrecognized Claude integration/);
    assert.equal(runner.calls.length, 1);
    assert.equal(existsSync(claudePath), true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('successful install remains successful when legacy inspection fails', async () => {
  const home = tempHome();
  const errors = [];
  copyCanonical(home);
  const runner = fakeRunner({
    available: ['codex'],
    responses: [
      { code: 0, stdout: JSON.stringify([managerEntry('test-source')]), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: JSON.stringify([managerEntry('test-source')]), stderr: '' },
      { code: 1, stdout: '', stderr: 'unsupported command' },
    ],
  });
  try {
    assert.equal(await runCli(['install'], runOptions(home, runner, [], errors)), 0);
    assert.match(errors.join('\n'), /Could not inspect legacy Codex state/);
    assert.equal(existsSync(join(home, '.agents', 'skills', 'flutter-rules', 'SKILL.md')), true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('explicit Claude install uses the adapter and warns about Devin', async () => {
  const home = tempHome();
  const output = [];
  copyCanonical(home);
  const claudePath = join(home, '.claude', 'skills', 'flutter-rules');
  mkdirSync(dirname(claudePath), { recursive: true });
  symlinkSync(join(home, '.agents', 'skills', 'flutter-rules'), claudePath, process.platform === 'win32' ? 'junction' : 'dir');
  const runner = fakeRunner({
    responses: [
      { code: 0, stdout: JSON.stringify([managerEntry('test-source')]), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: JSON.stringify([managerEntry('test-source', ['Claude Code'])]), stderr: '' },
    ],
  });
  try {
    assert.equal(await runCli(['install', 'claude'], runOptions(home, runner, output)), 0);
    assert.deepEqual(runner.calls[1].args.slice(1), [
      'add', 'test-source',
      '--skill', 'flutter-rules',
      '--agent', 'claude-code',
      '--global',
      '--yes',
    ]);
    assert.match(output.join('\n'), /Devin may display the Claude provider separately/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('explicit Claude install migrates an owned stale v1 copy', async () => {
  const home = tempHome();
  const canonical = copyCanonical(home);
  const claudePath = copyCanonical(home, join(home, '.claude', 'skills', 'flutter-rules'));
  const skillPath = join(claudePath, 'SKILL.md');
  writeFileSync(
    skillPath,
    readFileSync(skillPath, 'utf8').replace(`version: "${packageVersion}"`, 'version: "1.1.2"'),
  );
  const runner = fakeRunner({
    responses: [
      { code: 0, stdout: JSON.stringify([managerEntry('test-source')]), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: JSON.stringify([managerEntry('test-source', ['Claude Code'])]), stderr: '' },
    ],
    onRun({ index }) {
      if (index !== 1) return;
      rmSync(claudePath, { recursive: true, force: true });
      symlinkSync(canonical, claudePath, process.platform === 'win32' ? 'junction' : 'dir');
    },
  });
  try {
    assert.equal(await runCli(['install', 'claude'], runOptions(home, runner)), 0);
    assert.equal(inspectAdapterPath(claudePath, canonical, packageVersion).healthy, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('update refreshes Claude only when its integration already exists', async () => {
  const home = tempHome();
  copyCanonical(home);
  const claudePath = join(home, '.claude', 'skills', 'flutter-rules');
  mkdirSync(dirname(claudePath), { recursive: true });
  symlinkSync(join(home, '.agents', 'skills', 'flutter-rules'), claudePath, process.platform === 'win32' ? 'junction' : 'dir');
  const runner = fakeRunner({
    responses: [
      { code: 0, stdout: JSON.stringify([managerEntry('test-source', ['Codex', 'Claude Code'])]), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: JSON.stringify([managerEntry('test-source', ['Codex', 'Claude Code'])]), stderr: '' },
    ],
  });
  try {
    assert.equal(await runCli(['update'], runOptions(home, runner)), 0);
    assert.equal(runner.calls.filter((call) => call.args.includes('add')).length, 2);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('update accepts the same repository pinned to an older ref', async () => {
  const home = tempHome();
  const output = [];
  copyCanonical(home);
  const runner = fakeRunner({
    responses: [
      { code: 0, stdout: JSON.stringify([pinnedEntry('v2.0.0')]), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: JSON.stringify([pinnedEntry(`v${packageVersion}`)]), stderr: '' },
    ],
  });
  const options = runOptions(home, runner, output);
  options.env.FLUTTER_RULES_SKILL_SOURCE = `aswinsubhash/flutter-rules#v${packageVersion}`;
  try {
    assert.equal(await runCli(['update'], options), 0);
    assert.match(output.join('\n'), /Updated Flutter Rules/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('uninstall accepts the same repository pinned to an older ref', async () => {
  const home = tempHome();
  const output = [];
  copyCanonical(home);
  const runner = fakeRunner({
    responses: [
      { code: 0, stdout: JSON.stringify([pinnedEntry('v2.0.0')]), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    ],
  });
  const options = runOptions(home, runner, output);
  options.env.FLUTTER_RULES_SKILL_SOURCE = 'aswinsubhash/flutter-rules#v99.0.0';
  try {
    assert.equal(await runCli(['uninstall'], options), 0);
    assert.equal(existsSync(join(home, '.agents', 'skills', 'flutter-rules')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('install still refuses a registration from another repository', async () => {
  const home = tempHome();
  copyCanonical(home);
  const runner = fakeRunner({
    responses: [
      { code: 0, stdout: JSON.stringify([pinnedEntry('v2.0.0', 'someone-else/flutter-rules')]), stderr: '' },
    ],
  });
  const options = runOptions(home, runner);
  options.env.FLUTTER_RULES_SKILL_SOURCE = 'aswinsubhash/flutter-rules#v2.0.0';
  try {
    await assert.rejects(runCli(['install'], options), /Refusing to overwrite Flutter Rules registered from/);
    assert.equal(runner.calls.length, 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('doctor separates a stale ref from an unrecognized repository', async () => {
  const home = tempHome();
  const errors = [];
  copyCanonical(home);
  const runner = fakeRunner({
    responses: [{ code: 0, stdout: JSON.stringify([pinnedEntry('v2.0.0')]), stderr: '' }],
  });
  const options = runOptions(home, runner, [], errors);
  options.env.FLUTTER_RULES_SKILL_SOURCE = 'aswinsubhash/flutter-rules#v99.0.0';
  try {
    assert.equal(await runCli(['doctor'], options), 1);
    assert.match(errors.join('\n'), /pinned to aswinsubhash\/flutter-rules#v2\.0\.0; run `flutter-rules update`/);
    assert.doesNotMatch(errors.join('\n'), /missing or unexpected/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('legacy non-destructive aliases warn and redirect', async () => {
  const home = tempHome();
  const output = [];
  copyCanonical(home);
  const runner = fakeRunner({
    responses: [
      { code: 0, stdout: JSON.stringify([managerEntry('test-source')]), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: JSON.stringify([managerEntry('test-source')]), stderr: '' },
    ],
  });
  try {
    assert.equal(await runCli(['install', 'all'], runOptions(home, runner, output)), 0);
    assert.match(output[0], /deprecated/);
    assert.equal(runner.calls[0].args.includes('claude-code'), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('legacy update and doctor aliases warn and redirect', async () => {
  const home = tempHome();
  const output = [];
  copyCanonical(home);
  const runner = fakeRunner({
    responses: [
      { code: 0, stdout: JSON.stringify([managerEntry('test-source')]), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: JSON.stringify([managerEntry('test-source')]), stderr: '' },
      { code: 0, stdout: JSON.stringify([managerEntry('test-source')]), stderr: '' },
    ],
  });
  try {
    assert.equal(await runCli(['update', 'codex'], runOptions(home, runner, output)), 0);
    assert.equal(await runCli(['doctor', 'cursor'], runOptions(home, runner, output)), 0);
    assert.equal(output.filter((line) => line.includes('deprecated')).length, 2);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('legacy uninstall all warns and redirects to full removal', async () => {
  const home = tempHome();
  const output = [];
  const runner = fakeRunner({
    responses: [
      { code: 0, stdout: '[]', stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    ],
  });
  try {
    assert.equal(await runCli(['uninstall', 'all'], runOptions(home, runner, output)), 0);
    assert.match(output[0], /deprecated/);
    assert.deepEqual(runner.calls[1].args.slice(1), [
      'remove', 'flutter-rules', '--agent', 'claude-code', '--global', '--yes',
    ]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('destructive per-agent aliases fail before any runner call', async () => {
  const runner = fakeRunner();
  for (const target of ['agents', 'codex', 'cursor', 'devin', 'claude']) {
    await assert.rejects(
      runCli(['uninstall', target], { runner, packageRoot: repoRoot }),
      /Cannot uninstall .* independently/,
    );
  }
  assert.equal(runner.calls.length, 0);
});

test('doctor JSON emits stable healthy schema', async () => {
  const home = tempHome();
  const output = [];
  copyCanonical(home);
  const runner = fakeRunner({
    responses: [{ code: 0, stdout: JSON.stringify([managerEntry('test-source')]), stderr: '' }],
  });
  try {
    assert.equal(await runCli(['doctor', '--json'], runOptions(home, runner, output)), 0);
    assert.equal(output.length, 1);
    const payload = JSON.parse(output[0]);
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.healthy, true);
    assert.equal(payload.canonical.version, packageVersion);
    assert.deepEqual(payload.legacy.artifacts, []);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('doctor honors a custom Claude configuration directory', async () => {
  const home = tempHome();
  const customClaude = join(home, 'custom-claude');
  const output = [];
  const canonical = copyCanonical(home);
  const claudePath = join(customClaude, 'skills', 'flutter-rules');
  mkdirSync(dirname(claudePath), { recursive: true });
  symlinkSync(canonical, claudePath, process.platform === 'win32' ? 'junction' : 'dir');
  const runner = fakeRunner({
    responses: [{ code: 0, stdout: JSON.stringify([managerEntry('test-source')]), stderr: '' }],
  });
  try {
    const options = runOptions(home, runner, output);
    options.env.CLAUDE_CONFIG_DIR = customClaude;
    assert.equal(await runCli(['doctor', '--json'], options), 0);
    assert.equal(JSON.parse(output[0]).claude.installed, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('doctor JSON routes legacy alias warnings to stderr', async () => {
  const home = tempHome();
  const output = [];
  const errors = [];
  copyCanonical(home);
  const runner = fakeRunner({
    responses: [{ code: 0, stdout: JSON.stringify([managerEntry('test-source')]), stderr: '' }],
  });
  try {
    assert.equal(await runCli(['doctor', 'cursor', '--json'], runOptions(home, runner, output, errors)), 0);
    assert.equal(output.length, 1);
    assert.doesNotThrow(() => JSON.parse(output[0]));
    assert.match(errors.join('\n'), /deprecated/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('doctor reports stale and legacy state as unhealthy', async () => {
  const home = tempHome();
  const legacy = join(home, '.cursor', 'skills', 'flutter-rules');
  copyCanonical(home);
  copyCanonical(home, legacy);
  const skillPath = join(home, '.agents', 'skills', 'flutter-rules', 'SKILL.md');
  writeFileSync(skillPath, readFileSync(skillPath, 'utf8').replace(`version: "${packageVersion}"`, 'version: "1.0.0"'));
  const runner = fakeRunner({
    responses: [{ code: 0, stdout: JSON.stringify([managerEntry('wrong-source')]), stderr: '' }],
  });
  try {
    assert.equal(await runCli(['doctor', '--json'], runOptions(home, runner, [])), 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('targetless uninstall removes only wrapper-managed adapters', async () => {
  const home = tempHome();
  const runner = fakeRunner({
    responses: [
      { code: 0, stdout: '[]', stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    ],
  });
  try {
    assert.equal(await runCli(['uninstall'], runOptions(home, runner)), 0);
    assert.deepEqual(runner.calls[1].args.slice(1), [
      'remove', 'flutter-rules', '--agent', 'claude-code', '--global', '--yes',
    ]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('uninstall removes a recognized Claude adapter left behind by Skills CLI', async () => {
  const home = tempHome();
  const canonical = copyCanonical(home);
  const claudePath = join(home, '.claude', 'skills', 'flutter-rules');
  mkdirSync(dirname(claudePath), { recursive: true });
  symlinkSync(canonical, claudePath, process.platform === 'win32' ? 'junction' : 'dir');
  const runner = fakeRunner({
    responses: [
      { code: 0, stdout: JSON.stringify([managerEntry('test-source')]), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    ],
  });
  try {
    assert.equal(await runCli(['uninstall'], runOptions(home, runner)), 0);
    assert.equal(pathEntryExists(claudePath), false);
    assert.equal(existsSync(canonical), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('legacy cleanup removes owned artifacts and preserves foreign paths', () => {
  const home = tempHome();
  const canonicalPath = copyCanonical(home);
  const owned = copyCanonical(home, join(home, '.cursor', 'skills', 'flutter-rules'));
  const foreign = join(home, '.codex', 'skills', 'flutter-rules');
  mkdirSync(foreign, { recursive: true });
  writeFileSync(join(foreign, 'SKILL.md'), 'foreign');
  const runner = fakeRunner();
  try {
    const result = cleanupLegacy({ home, runner, canonicalPath });
    assert.equal(existsSync(owned), false);
    assert.equal(existsSync(foreign), true);
    assert.match(result.warnings.join('\n'), /Preserved unrecognized legacy path/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('legacy inspection preserves a Skills CLI-managed Claude adapter copy', () => {
  const home = tempHome();
  const canonicalPath = copyCanonical(home);
  const claudePath = copyCanonical(home, join(home, '.claude', 'skills', 'flutter-rules'));
  try {
    const state = inspectLegacy({
      home,
      runner: fakeRunner(),
      canonicalPath,
      managedPaths: [canonicalPath, claudePath],
    });
    assert.equal(state.artifacts.some((entry) => entry.path === claudePath), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('legacy cleanup removes exact user plugin and marketplace identities', () => {
  const home = tempHome();
  const canonicalPath = copyCanonical(home);
  const runner = fakeRunner({
    available: ['codex'],
    responses: [
      { code: 0, stdout: JSON.stringify({ installed: [{ pluginId: 'flutter-rules@flutter-rules' }] }), stderr: '' },
      { code: 0, stdout: JSON.stringify({ marketplaces: [{ name: 'flutter-rules' }] }), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    ],
  });
  try {
    const result = cleanupLegacy({ home, runner, canonicalPath });
    assert.equal(result.removed.some((entry) => entry.kind === 'codex-plugin'), true);
    assert.equal(result.removed.some((entry) => entry.kind === 'codex-marketplace'), true);
    assert.deepEqual(runner.calls.slice(2).map((call) => call.args), [
      ['plugin', 'remove', 'flutter-rules@flutter-rules'],
      ['plugin', 'marketplace', 'remove', 'flutter-rules'],
    ]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('legacy cleanup preserves non-user Claude scope and its marketplace', () => {
  const home = tempHome();
  const canonicalPath = copyCanonical(home);
  const runner = fakeRunner({
    available: ['claude'],
    responses: [
      { code: 0, stdout: JSON.stringify([{ id: 'flutter-rules@flutter-rules', scope: 'project' }]), stderr: '' },
      { code: 0, stdout: JSON.stringify([{ name: 'flutter-rules' }]), stderr: '' },
    ],
  });
  try {
    const result = cleanupLegacy({ home, runner, canonicalPath });
    assert.equal(result.removed.length, 0);
    assert.match(result.warnings.join('\n'), /non-user-scoped legacy Claude plugin/);
    assert.equal(runner.calls.length, 2);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('real pinned Skills CLI lifecycle stays inside an isolated home', { timeout: 120_000 }, async () => {
  const home = tempHome();
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: join(home, 'AppData', 'Roaming'),
    FLUTTER_RULES_INSTALL_HOME: home,
    FLUTTER_RULES_SKILL_SOURCE: repoRoot,
    NO_COLOR: '1',
    PATH: process.platform === 'win32' ? dirname(process.execPath) : '/usr/bin:/bin',
  };
  const output = [];
  const errors = [];
  const options = {
    env,
    home,
    packageRoot: repoRoot,
    log: (message) => output.push(message),
    error: (message) => errors.push(message),
  };
  try {
    assert.equal(await runCli(['install'], options), 0);
    const canonical = join(home, '.agents', 'skills', 'flutter-rules');
    assert.equal(inspectSkillDirectory(canonical, packageVersion).healthy, true);
    assert.equal(existsSync(join(repoRoot, '.agents')), false);

    const doctorOutput = [];
    assert.equal(await runCli(['doctor', '--json'], { ...options, log: (message) => doctorOutput.push(message) }), 0);
    assert.equal(JSON.parse(doctorOutput[0]).healthy, true);

    assert.equal(await runCli(['install', 'claude'], options), 0);
    assert.equal(pathEntryExists(join(home, '.claude', 'skills', 'flutter-rules')), true);
    assert.equal(await runCli(['update'], options), 0);
    assert.equal(await runCli(['uninstall'], options), 0);
    assert.equal(existsSync(canonical), false);
    assert.equal(pathEntryExists(join(home, '.claude', 'skills', 'flutter-rules')), false);
    const lockPath = join(home, '.agents', '.skill-lock.json');
    if (existsSync(lockPath)) {
      const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
      assert.equal('flutter-rules' in (lock.skills || {}), false);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

function pathEntryExists(path) {
  try {
    return existsSync(path) || readFileSync(path) !== undefined;
  } catch {
    try {
      lstatSync(path);
      return true;
    } catch {
      return false;
    }
  }
}
