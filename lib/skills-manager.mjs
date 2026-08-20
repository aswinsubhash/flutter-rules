import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const skillsPackagePath = require.resolve('skills/package.json');
const skillsCliPath = join(dirname(skillsPackagePath), 'bin', 'cli.mjs');

function globalLockEntry(name, env) {
  const home = env.HOME || env.USERPROFILE || homedir();
  const lockPath = env.XDG_STATE_HOME
    ? join(env.XDG_STATE_HOME, 'skills', '.skill-lock.json')
    : join(home, '.agents', '.skill-lock.json');
  if (!existsSync(lockPath)) return null;
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8')).skills?.[name] ?? null;
  } catch {
    return null;
  }
}

function failure(command, result) {
  const details = result.stderr?.trim() || result.stdout?.trim() || `exit code ${result.code}`;
  return new Error(`${command} failed: ${details}`);
}

export function skillSource(version, env = process.env) {
  return env.FLUTTER_RULES_SKILL_SOURCE || `aswinsubhash/flutter-rules#v${version}`;
}

export function sourceStatus(entry, expectedSource) {
  if (!entry) return { owned: false, current: false, source: null, ref: null, local: false };
  if (existsSync(expectedSource)) {
    return { owned: true, current: true, source: expectedSource, ref: null, local: true };
  }
  const separator = expectedSource.lastIndexOf('#');
  const repository = separator >= 0 ? expectedSource.slice(0, separator) : expectedSource;
  const ref = separator >= 0 ? expectedSource.slice(separator + 1) : null;
  const normalizedRepository = repository.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').toLowerCase();
  const recordedRepository = String(entry.source || '').replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').toLowerCase();
  const sourceUrlRepository = String(entry.sourceUrl || '').replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').toLowerCase();
  const owned = recordedRepository === normalizedRepository || sourceUrlRepository === normalizedRepository;
  return {
    owned,
    current: owned && (!ref || entry.ref === ref),
    source: repository,
    ref: entry.ref ?? null,
    local: false,
  };
}

export function resolveSkillsCliPath() {
  return skillsCliPath;
}

export function createSkillsManager({ runner, version, env = process.env }) {
  const source = skillSource(version, env);

  const run = (args, { quiet = false } = {}) => {
    const result = runner.run(process.execPath, [skillsCliPath, ...args], { quiet });
    if (result.code !== 0) throw failure(`skills ${args.join(' ')}`, result);
    return result;
  };

  return {
    source,
    installShared() {
      return run([
        'add', source,
        '--skill', 'flutter-rules',
        '--agent', 'codex',
        '--global',
        '--yes',
      ]);
    },
    installClaude() {
      return run([
        'add', source,
        '--skill', 'flutter-rules',
        '--agent', 'claude-code',
        '--global',
        '--yes',
      ]);
    },
    list() {
      const result = run(['list', '--global', '--json'], { quiet: true });
      let payload;
      try {
        payload = JSON.parse(result.stdout || '[]');
      } catch {
        throw new Error('Could not parse Skills CLI JSON output.');
      }
      if (!Array.isArray(payload)) throw new Error('Skills CLI returned an unexpected JSON payload.');
      const lockEntry = globalLockEntry('flutter-rules', env);
      return payload.map((entry) => entry?.name === 'flutter-rules'
        ? {
          ...entry,
          source: entry.source ?? lockEntry?.source ?? null,
          sourceUrl: entry.sourceUrl ?? lockEntry?.sourceUrl ?? null,
          ref: entry.ref ?? lockEntry?.ref ?? null,
        }
        : entry);
    },
    find() {
      return this.list().find((entry) => entry?.name === 'flutter-rules') ?? null;
    },
    uninstall() {
      return run([
        'remove', 'flutter-rules',
        '--agent', 'claude-code',
        '--global',
        '--yes',
      ]);
    },
  };
}
