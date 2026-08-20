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

function readSharedSkill(path) {
  const content = readFileSync(path, 'utf8');
  assert.match(content, /^disable-model-invocation: true$/m);
  assert.match(content, /^triggers: \["user"\]$/m);
  return content;
}

function readClaudeSkill(path) {
  const content = readFileSync(path, 'utf8');
  assert.match(content, /^disable-model-invocation: true$/m);
  assert.doesNotMatch(content, /^triggers:/m);
  return content;
}

test('argument parser removes dry-run flags without changing command values', () => {
  assert.deepEqual(parseArgs(['install', 'agents', '--dry-run']), {
    values: ['install', 'agents'],
    dryRun: true,
  });
});

test('CLI rejects unknown options and surplus arguments explicitly', async () => {
  await assert.rejects(runCli(['install', 'agents', '--dryrun']), /Unknown option: --dryrun/);
  await assert.rejects(runCli(['install', 'agents', 'oops']), /Unexpected argument: oops/);
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

test('setup devin redirects to the shared agents installation without touching the filesystem', async () => {
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
    assert.match(output.join('\n'), /flutter-rules install agents/);
    assert.deepEqual(readdirSync(home), before);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('agents install and update maintain one shared manual-only skill', async () => {
  const home = tempHome();
  const runner = fakeRunner();
  const destination = join(home, '.agents', 'skills', 'flutter-rules');
  try {
    await runCli(['install', 'agents'], { home, runner, packageRoot: repoRoot });
    readSharedSkill(join(destination, 'SKILL.md'));
    assert.match(readFileSync(join(destination, 'agents', 'openai.yaml'), 'utf8'), /allow_implicit_invocation: false/);
    assert.equal(existsSync(join(home, '.cursor')), false);

    writeFileSync(join(destination, 'old-marker.txt'), 'old');
    await runCli(['update', 'agents'], { home, runner, packageRoot: repoRoot });
    assert.equal(existsSync(join(destination, 'old-marker.txt')), false);
    assert.deepEqual(
      readdirSync(join(home, '.agents', 'skills')).filter((name) => name.startsWith('flutter-rules.backup.')),
      [],
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('codex, cursor, and devin aliases use the shared agents destination', async () => {
  for (const target of ['codex', 'cursor', 'devin']) {
    const home = tempHome();
    try {
      await runCli(['install', target], { home, runner: fakeRunner(), packageRoot: repoRoot });
      assert.ok(existsSync(join(home, '.agents', 'skills', 'flutter-rules', 'SKILL.md')));
      assert.equal(existsSync(join(home, '.cursor')), false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }
});

test('agents migration removes legacy Codex plugin, marketplace, and Cursor copy', async () => {
  const home = tempHome();
  const legacyCursor = join(home, '.cursor', 'skills', 'flutter-rules');
  const runner = fakeRunner({
    available: ['codex'],
    responses: [
      { code: 0, stdout: JSON.stringify({ installed: [{ pluginId: 'flutter-rules@flutter-rules' }] }), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: JSON.stringify({ marketplaces: [{ name: 'flutter-rules' }] }), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    ],
  });
  try {
    mkdirSync(legacyCursor, { recursive: true });
    writeFileSync(join(legacyCursor, 'SKILL.md'), 'legacy');
    await runCli(['install', 'agents'], { home, runner, packageRoot: repoRoot });
    assert.equal(existsSync(legacyCursor), false);
    assert.deepEqual(runner.calls, [
      ['codex', 'plugin', 'list', '--json'],
      ['codex', 'plugin', 'remove', 'flutter-rules@flutter-rules'],
      ['codex', 'plugin', 'marketplace', 'list', '--json'],
      ['codex', 'plugin', 'marketplace', 'remove', 'flutter-rules'],
    ]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Codex migration preserves plugins outside user scope', async () => {
  const home = tempHome();
  const output = [];
  const runner = fakeRunner({
    available: ['codex'],
    responses: [{
      code: 0,
      stdout: JSON.stringify({ installed: [{ pluginId: 'flutter-rules@flutter-rules', scope: 'project' }] }),
      stderr: '',
    }],
  });
  try {
    await runCli(['install', 'agents'], {
      home,
      runner,
      packageRoot: repoRoot,
      log: (message) => output.push(message),
    });
    assert.ok(existsSync(join(home, '.agents', 'skills', 'flutter-rules', 'SKILL.md')));
    assert.match(output.join('\n'), /legacy Codex plugin remains outside user scope/);
    assert.deepEqual(runner.calls, [['codex', 'plugin', 'list', '--json']]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('standalone installation survives a legacy CLI cleanup failure', async () => {
  const home = tempHome();
  const output = [];
  const runner = fakeRunner({
    available: ['codex'],
    responses: [{ code: 1, stdout: '', stderr: 'unsupported command' }],
  });
  try {
    await runCli(['install', 'agents'], {
      home,
      runner,
      packageRoot: repoRoot,
      log: (message) => output.push(message),
    });
    assert.ok(existsSync(join(home, '.agents', 'skills', 'flutter-rules', 'SKILL.md')));
    assert.match(output.join('\n'), /Could not clean up the legacy Codex plugin/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Claude install and update maintain one standalone user-only skill', async () => {
  const home = tempHome();
  const runner = fakeRunner();
  const destination = join(home, '.claude', 'skills', 'flutter-rules');
  try {
    await runCli(['install', 'claude'], { home, runner, packageRoot: repoRoot });
    readClaudeSkill(join(destination, 'SKILL.md'));
    assert.equal(existsSync(join(destination, 'agents')), false);

    writeFileSync(join(destination, 'old-marker.txt'), 'old');
    await runCli(['update', 'claude'], { home, runner, packageRoot: repoRoot });
    assert.equal(existsSync(join(destination, 'old-marker.txt')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Claude migration removes a legacy user plugin and marketplace', async () => {
  const home = tempHome();
  const runner = fakeRunner({
    available: ['claude'],
    responses: [
      { code: 0, stdout: JSON.stringify([{ id: 'flutter-rules@flutter-rules', scope: 'user' }]), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: JSON.stringify([{ name: 'flutter-rules' }]), stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    ],
  });
  try {
    await runCli(['install', 'claude'], { home, runner, packageRoot: repoRoot });
    assert.deepEqual(runner.calls, [
      ['claude', 'plugin', 'list', '--json'],
      ['claude', 'plugin', 'uninstall', 'flutter-rules@flutter-rules', '--scope', 'user'],
      ['claude', 'plugin', 'marketplace', 'list', '--json'],
      ['claude', 'plugin', 'marketplace', 'remove', 'flutter-rules'],
    ]);
    assert.ok(existsSync(join(home, '.claude', 'skills', 'flutter-rules', 'SKILL.md')));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Claude migration preserves project-scoped plugins and installs the standalone skill', async () => {
  const home = tempHome();
  const output = [];
  const runner = fakeRunner({
    available: ['claude'],
    responses: [{
      code: 0,
      stdout: JSON.stringify([{ id: 'flutter-rules@flutter-rules', scope: 'project' }]),
      stderr: '',
    }],
  });
  try {
    await runCli(['install', 'claude'], {
      home,
      runner,
      packageRoot: repoRoot,
      log: (message) => output.push(message),
    });
    assert.ok(existsSync(join(home, '.claude', 'skills', 'flutter-rules', 'SKILL.md')));
    assert.match(output.join('\n'), /legacy Claude plugin remains outside user scope/);
    assert.deepEqual(runner.calls, [['claude', 'plugin', 'list', '--json']]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('standalone dry-run skips an unavailable Claude installation', async () => {
  const home = tempHome();
  const output = [];
  try {
    const code = await runCli(['install', 'all', '--dry-run'], {
      home,
      runner: fakeRunner(),
      packageRoot: repoRoot,
      log: (message) => output.push(message),
    });
    assert.equal(code, 0);
    assert.match(output.join('\n'), /DRY RUN: render .*\.agents.*flutter-rules/);
    assert.match(output.join('\n'), /claude: Skipped because the Claude Code CLI was not detected/);
    assert.doesNotMatch(output.join('\n'), /DRY RUN: render .*\.claude/);
    assert.equal(existsSync(join(home, '.agents')), false);
    assert.equal(existsSync(join(home, '.claude')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('all skips an empty Claude destination when Claude is unavailable', async () => {
  const home = tempHome();
  const destination = join(home, '.claude', 'skills', 'flutter-rules');
  const output = [];
  try {
    mkdirSync(destination, { recursive: true });
    await runCli(['install', 'all'], {
      home,
      runner: fakeRunner(),
      packageRoot: repoRoot,
      log: (message) => output.push(message),
    });
    assert.equal(existsSync(join(destination, 'SKILL.md')), false);
    assert.match(output.join('\n'), /Skipped because the Claude Code CLI was not detected/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('standalone dry-run rejects a missing skill source', async () => {
  const home = tempHome();
  try {
    await assert.rejects(
      runCli(['install', 'agents', '--dry-run'], { home, packageRoot: join(home, 'missing-package') }),
      /ENOENT/,
    );
    assert.equal(existsSync(join(home, '.agents')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('failed frontmatter rendering leaves no standalone destination', async () => {
  const home = tempHome();
  const packageRoot = join(home, 'package');
  const source = join(packageRoot, 'src', 'flutter-rules');
  try {
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'SKILL.md'), '---\nname: flutter-rules\nmetadata:\n  version: 1.2.3\n');
    await assert.rejects(
      runCli(['install', 'agents'], { home, runner: fakeRunner(), packageRoot }),
      /missing its closing delimiter/,
    );
    assert.equal(existsSync(join(home, '.agents')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('shared rendering filters unsupported files while retaining Codex policy', async () => {
  const home = tempHome();
  const packageRoot = join(home, 'package');
  const source = join(packageRoot, 'src', 'flutter-rules');
  const destination = join(home, '.agents', 'skills', 'flutter-rules');
  try {
    mkdirSync(join(source, 'references'), { recursive: true });
    mkdirSync(join(source, 'agents'));
    writeFileSync(join(source, 'SKILL.md'), '---\nname: flutter-rules\nmetadata:\n  version: 1.2.3\n---\n');
    writeFileSync(join(source, '.DS_Store'), 'metadata');
    writeFileSync(join(source, 'extra.txt'), 'extra');
    writeFileSync(join(source, 'references', '.DS_Store'), 'metadata');
    writeFileSync(join(source, 'references', 'guide.md'), 'guide');
    writeFileSync(join(source, 'agents', 'openai.yaml'), 'policy:\n  allow_implicit_invocation: false\n');
    await runCli(['install', 'agents'], { home, runner: fakeRunner(), packageRoot });
    assert.deepEqual(readdirSync(destination).sort(), ['SKILL.md', 'agents', 'references']);
    assert.deepEqual(readdirSync(join(destination, 'references')), ['guide.md']);
    assert.deepEqual(readdirSync(join(destination, 'agents')), ['openai.yaml']);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('all installs only detected tools and explicit Claude install remains available', async () => {
  const home = tempHome();
  const output = [];
  const runner = fakeRunner();
  try {
    assert.equal(await runCli(['install', 'all'], {
      home,
      runner,
      packageRoot: repoRoot,
      log: (message) => output.push(message),
    }), 0);
    assert.ok(existsSync(join(home, '.agents', 'skills', 'flutter-rules', 'SKILL.md')));
    assert.equal(existsSync(join(home, '.claude')), false);
    assert.match(output.join('\n'), /Skipped because the Claude Code CLI was not detected/);

    await runCli(['install', 'claude'], { home, runner, packageRoot: repoRoot });
    const claudeDestination = join(home, '.claude', 'skills', 'flutter-rules');
    assert.ok(existsSync(join(claudeDestination, 'SKILL.md')));
    writeFileSync(join(claudeDestination, 'old-marker.txt'), 'old');
    await runCli(['update', 'all'], { home, runner, packageRoot: repoRoot });
    assert.equal(existsSync(join(claudeDestination, 'old-marker.txt')), false);

    assert.equal(await runCli(['uninstall', 'all'], { home, runner, packageRoot: repoRoot }), 0);
    assert.equal(existsSync(join(home, '.agents', 'skills', 'flutter-rules')), false);
    assert.equal(existsSync(join(home, '.claude', 'skills', 'flutter-rules')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('all installs Claude when the Claude CLI is detected', async () => {
  const home = tempHome();
  const runner = fakeRunner({ available: ['claude'] });
  try {
    assert.equal(await runCli(['install', 'all'], { home, runner, packageRoot: repoRoot }), 0);
    assert.ok(existsSync(join(home, '.agents', 'skills', 'flutter-rules', 'SKILL.md')));
    assert.ok(existsSync(join(home, '.claude', 'skills', 'flutter-rules', 'SKILL.md')));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('doctors validate standalone metadata, Codex policy, and legacy duplicates', async () => {
  const home = tempHome();
  const runner = fakeRunner({ available: ['claude'] });
  const agentsSkill = join(home, '.agents', 'skills', 'flutter-rules', 'SKILL.md');
  const policy = join(home, '.agents', 'skills', 'flutter-rules', 'agents', 'openai.yaml');
  const version = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version;
  try {
    await runCli(['install', 'all'], { home, runner, packageRoot: repoRoot });
    const output = [];
    await runCli(['doctor', 'agents'], { home, runner, log: (message) => output.push(message) });
    await runCli(['doctor', 'claude'], { home, runner, log: (message) => output.push(message) });
    assert.match(output.join('\n'), new RegExp(`Shared Codex, Cursor, and Devin skill is installed at version ${version.replaceAll('.', '\\.')}`));
    assert.match(output.join('\n'), new RegExp(`Claude Code standalone skill is installed at version ${version.replaceAll('.', '\\.')}`));

    const currentSkill = readFileSync(agentsSkill, 'utf8');
    writeFileSync(agentsSkill, currentSkill.replace(`version: "${version}"`, 'version: "0.0.0"'));
    const outdated = [];
    await runCli(['doctor', 'agents'], { home, runner, log: (message) => outdated.push(message) });
    assert.match(outdated.join('\n'), /is outdated \(0\.0\.0; expected/);
    writeFileSync(agentsSkill, currentSkill);

    writeFileSync(policy, 'other:\n  allow_implicit_invocation: false\n');
    const missingPolicy = [];
    await runCli(['doctor', 'agents'], { home, runner, log: (message) => missingPolicy.push(message) });
    assert.match(missingPolicy.join('\n'), /missing the Codex manual-invocation policy/);

    writeFileSync(policy, 'policy:\n  allow_implicit_invocation: false\npolicy:\n  allow_implicit_invocation: true\n');
    const duplicatePolicy = [];
    await runCli(['doctor', 'agents'], { home, runner, log: (message) => duplicatePolicy.push(message) });
    assert.match(duplicatePolicy.join('\n'), /missing the Codex manual-invocation policy/);

    await runCli(['update', 'agents'], { home, runner, packageRoot: repoRoot });
    mkdirSync(join(home, '.cursor', 'skills', 'flutter-rules'), { recursive: true });
    writeFileSync(join(home, '.cursor', 'skills', 'flutter-rules', 'SKILL.md'), readFileSync(agentsSkill));
    const duplicate = [];
    await runCli(['doctor', 'agents'], { home, runner, log: (message) => duplicate.push(message) });
    assert.match(duplicate.join('\n'), /duplicate legacy Cursor copy/);
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
