import { existsSync, lstatSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCommandRunner } from './command-runner.mjs';
import { cleanupLegacy, inspectLegacy } from './legacy-cleanup.mjs';
import { inspectAdapterPath, inspectSkillDirectory, isOwnedSkillDirectory } from './skill-inspector.mjs';
import { createSkillsManager, sourceStatus } from './skills-manager.mjs';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY_SHARED_TARGETS = new Set(['agents', 'codex', 'cursor', 'devin', 'all']);
const LEGACY_TARGETS = new Set([...LEGACY_SHARED_TARGETS, 'claude']);

const HELP = `Usage:
  flutter-rules install [claude]
  flutter-rules update
  flutter-rules doctor [--json]
  flutter-rules uninstall

Options:
  --dry-run       Print actions without changing files or running tools.
  --json          Emit machine-readable doctor output.
  --version       Print the CLI version.
  --help          Show this help.
`;

const DEVIN_SETUP = `\`setup devin\` is deprecated.
Run: flutter-rules install

This installs Flutter Rules globally for compatible agents.
`;

function packageVersion(packageRoot = PACKAGE_ROOT) {
  return JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;
}

function parseArgs(argv) {
  const values = [];
  let dryRun = false;
  let json = false;
  for (const value of argv) {
    if (value === '--dry-run') dryRun = true;
    else if (value === '--json') json = true;
    else if (value.startsWith('-') && !['--help', '--version'].includes(value)) {
      throw new Error(`Unknown option: ${value}`);
    } else values.push(value);
  }
  return { values, dryRun, json };
}

function pathWithinHome(path, home) {
  if (!path) return false;
  const child = relative(resolve(home), resolve(path));
  return child === '' || (!child.startsWith('..') && !isAbsolute(child));
}

function scopedEnvironment(env, home) {
  const scoped = { ...env, HOME: home, USERPROFILE: home };
  if (env.FLUTTER_RULES_INSTALL_HOME || resolve(home) !== resolve(homedir())) {
    scoped.APPDATA = pathWithinHome(env.APPDATA, home) ? env.APPDATA : join(home, 'AppData', 'Roaming');
    scoped.XDG_CONFIG_HOME = pathWithinHome(env.XDG_CONFIG_HOME, home) ? env.XDG_CONFIG_HOME : join(home, '.config');
    scoped.XDG_STATE_HOME = pathWithinHome(env.XDG_STATE_HOME, home) ? env.XDG_STATE_HOME : join(home, '.local', 'state');
    scoped.CODEX_HOME = pathWithinHome(env.CODEX_HOME, home) ? env.CODEX_HOME : join(home, '.codex');
    scoped.CLAUDE_CONFIG_DIR = pathWithinHome(env.CLAUDE_CONFIG_DIR, home) ? env.CLAUDE_CONFIG_DIR : join(home, '.claude');
  }
  return scoped;
}

function agentsDestination(home) {
  return join(home, '.agents', 'skills', 'flutter-rules');
}

function claudeDestination(home, env = process.env) {
  return join(env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'skills', 'flutter-rules');
}

function pathEntryExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function warnRedirect(command, target, log) {
  log(`Warning: \`${command} ${target}\` is deprecated; running \`${command}\`.`);
}

function normalizeCommand({ command, target, extra, log }) {
  if (!['install', 'update', 'doctor', 'uninstall', 'setup'].includes(command)) {
    throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }
  if (extra.length > 0) {
    throw new Error(`Unexpected argument${extra.length > 1 ? 's' : ''}: ${extra.join(' ')}\n\n${HELP}`);
  }
  if (command === 'setup') {
    if (target !== 'devin') throw new Error('Only `setup devin` is supported.');
    return { command: 'setup', target: 'devin' };
  }
  if (command === 'install') {
    if (!target) return { command, target: 'shared' };
    if (target === 'claude') return { command, target };
    if (LEGACY_SHARED_TARGETS.has(target)) {
      warnRedirect(command, target, log);
      return { command, target: 'shared' };
    }
    throw new Error(`Unsupported target: ${target}\n\n${HELP}`);
  }
  if (command === 'uninstall') {
    if (!target) return { command, target: 'all' };
    if (target === 'all') {
      warnRedirect(command, target, log);
      return { command, target: 'all' };
    }
    if (LEGACY_TARGETS.has(target)) {
      throw new Error(`Cannot uninstall ${target} independently in v2. Run \`flutter-rules uninstall\` to remove all managed integrations.`);
    }
    throw new Error(`Unsupported target: ${target}\n\n${HELP}`);
  }
  if (!target) return { command, target: 'managed' };
  if (LEGACY_TARGETS.has(target)) {
    warnRedirect(command, target, log);
    return { command, target: 'managed' };
  }
  throw new Error(`Unsupported target: ${target}\n\n${HELP}`);
}

function recordedSource(entry, status, expectedSource) {
  if (!entry) return null;
  if (status.local) return expectedSource;
  if (!status.source) return entry.sourceUrl || null;
  return status.ref ? `${status.source}#${status.ref}` : status.source;
}

function preflightCanonical({ home, manager }) {
  const canonicalPath = agentsDestination(home);
  const entry = manager.find();
  const status = sourceStatus(entry, manager.source);
  if (pathEntryExists(canonicalPath) && !isOwnedSkillDirectory(canonicalPath)) {
    throw new Error(`Refusing to modify an unrecognized skill at ${canonicalPath}.`);
  }
  if (entry && !status.owned && (entry.source || entry.sourceUrl)) {
    throw new Error(`Refusing to overwrite Flutter Rules registered from ${recordedSource(entry, status, manager.source) || 'an unknown source'}.`);
  }
  return { canonicalPath, entry, status };
}

function preflightClaude({ home, env, version, canonicalPath }) {
  const path = claudeDestination(home, env);
  const inspection = inspectAdapterPath(path, canonicalPath, version);
  if (inspection.installed && !inspection.healthy && !isOwnedSkillDirectory(path)) {
    throw new Error(`Refusing to modify an unrecognized Claude integration at ${path}: ${inspection.issues.join(' ')}`);
  }
  return { path, inspection };
}

function verifyInstallation({ home, manager, version }) {
  const canonicalPath = agentsDestination(home);
  const inspection = inspectSkillDirectory(canonicalPath, version);
  if (!inspection.healthy) throw new Error(`Installed Flutter Rules skill is invalid: ${inspection.issues.join(' ')}`);
  const entry = manager.find();
  if (!entry) throw new Error('Skills CLI did not register the Flutter Rules installation.');
  const status = sourceStatus(entry, manager.source);
  if (!status.current) {
    throw new Error(`Skills CLI registered an unexpected source: ${recordedSource(entry, status, manager.source) || 'unknown'}`);
  }
  return { canonicalPath, entry, inspection, source: recordedSource(entry, status, manager.source), sourceStatus: status };
}

function reportCleanup(result, { dryRun, log, error }) {
  if (result.removed.length > 0) {
    log(`${dryRun ? 'Would remove' : 'Removed'} ${result.removed.length} legacy Flutter Rules artifact${result.removed.length === 1 ? '' : 's'}.`);
  }
  for (const warning of result.warnings) error(`Warning: ${warning}`);
}

function managedPaths(home, env, includeClaude) {
  const paths = [agentsDestination(home)];
  if (includeClaude) paths.push(claudeDestination(home, env));
  return paths;
}

function legacyAdditionalPaths(home, env) {
  return [claudeDestination(home, env)];
}

function installShared(context) {
  const { dryRun, env, error, home, log, manager, runner, version } = context;
  const preflight = preflightCanonical({ home, manager });
  manager.installShared();
  if (dryRun) {
    const claudeInstalled = pathEntryExists(claudeDestination(home, env));
    const cleanup = cleanupLegacy({
      home,
      runner,
      canonicalPath: preflight.canonicalPath,
      managedPaths: managedPaths(home, env, claudeInstalled),
      additionalPaths: legacyAdditionalPaths(home, env),
      dryRun: true,
    });
    reportCleanup(cleanup, { dryRun, log, error });
    log('Would install Flutter Rules globally.');
    return 0;
  }
  const verified = verifyInstallation({ home, manager, version });
  const claudeInstalled = pathEntryExists(claudeDestination(home, env));
  const cleanup = cleanupLegacy({
    home,
    runner,
    canonicalPath: verified.canonicalPath,
    managedPaths: managedPaths(home, env, claudeInstalled),
    additionalPaths: legacyAdditionalPaths(home, env),
  });
  reportCleanup(cleanup, { dryRun, log, error });
  log(`Installed Flutter Rules ${version}.`);
  return 0;
}

function installClaude(context) {
  const { dryRun, env, error, home, log, manager, runner, version } = context;
  const preflight = preflightCanonical({ home, manager });
  preflightClaude({ home, env, version, canonicalPath: preflight.canonicalPath });
  manager.installClaude();
  if (dryRun) {
    const cleanup = cleanupLegacy({
      home,
      runner,
      canonicalPath: preflight.canonicalPath,
      managedPaths: managedPaths(home, env, true),
      additionalPaths: legacyAdditionalPaths(home, env),
      dryRun: true,
    });
    reportCleanup(cleanup, { dryRun, log, error });
    log('Would install Flutter Rules for Claude Code.');
    return 0;
  }
  const verified = verifyInstallation({ home, manager, version });
  const claudePath = claudeDestination(home, env);
  const claudeInspection = inspectAdapterPath(claudePath, verified.canonicalPath, version);
  if (!claudeInspection.installed || !claudeInspection.healthy) {
    throw new Error(`Skills CLI created an invalid Claude Code integration: ${claudeInspection.issues.join(' ')}`);
  }
  const cleanup = cleanupLegacy({
    home,
    runner,
    canonicalPath: verified.canonicalPath,
    managedPaths: managedPaths(home, env, true),
    additionalPaths: legacyAdditionalPaths(home, env),
  });
  reportCleanup(cleanup, { dryRun, log, error });
  log(`Installed Flutter Rules ${version} for Claude Code.`);
  log('Note: Devin may display the Claude provider separately when Claude configuration import is enabled.');
  return 0;
}

function updateManaged(context) {
  const { dryRun, env, error, home, log, manager, runner, version } = context;
  const preflight = preflightCanonical({ home, manager });
  const hadClaude = pathEntryExists(claudeDestination(home, env));
  if (hadClaude) preflightClaude({ home, env, version, canonicalPath: preflight.canonicalPath });
  manager.installShared();
  if (hadClaude) manager.installClaude();
  if (dryRun) {
    const cleanup = cleanupLegacy({
      home,
      runner,
      canonicalPath: preflight.canonicalPath,
      managedPaths: managedPaths(home, env, hadClaude),
      additionalPaths: legacyAdditionalPaths(home, env),
      dryRun: true,
    });
    reportCleanup(cleanup, { dryRun, log, error });
    log(`Would update Flutter Rules${hadClaude ? ' and its Claude Code integration' : ''}.`);
    return 0;
  }
  const verified = verifyInstallation({ home, manager, version });
  if (hadClaude) {
    const claudeInspection = inspectAdapterPath(claudeDestination(home, env), verified.canonicalPath, version);
    if (!claudeInspection.installed || !claudeInspection.healthy) {
      throw new Error(`Claude Code integration is invalid after update: ${claudeInspection.issues.join(' ')}`);
    }
  }
  const cleanup = cleanupLegacy({
    home,
    runner,
    canonicalPath: verified.canonicalPath,
    managedPaths: managedPaths(home, env, hadClaude),
    additionalPaths: legacyAdditionalPaths(home, env),
  });
  reportCleanup(cleanup, { dryRun, log, error });
  log(`Updated Flutter Rules to ${version}.`);
  return 0;
}

function doctorState({ env, home, manager, runner, version }) {
  const canonicalPath = agentsDestination(home);
  const canonical = inspectSkillDirectory(canonicalPath, version);
  let entry = null;
  let listError = null;
  try {
    entry = manager.find();
  } catch (reason) {
    listError = reason instanceof Error ? reason.message : String(reason);
  }
  const status = sourceStatus(entry, manager.source);
  const source = recordedSource(entry, status, manager.source);
  const sourceValid = status.current;
  const claudePath = claudeDestination(home, env);
  const claude = inspectAdapterPath(claudePath, canonicalPath, version);
  const legacy = inspectLegacy({
    home,
    runner,
    canonicalPath,
    managedPaths: managedPaths(home, env, claude.installed),
    additionalPaths: legacyAdditionalPaths(home, env),
  });
  const healthy = canonical.healthy
    && sourceValid
    && claude.healthy
    && legacy.artifacts.length === 0
    && legacy.inspectionWarnings.length === 0
    && !listError;
  return {
    schemaVersion: 1,
    healthy,
    expectedVersion: version,
    canonical: {
      installed: canonical.installed,
      version: canonical.version,
      source,
      sourceValid,
      sourceOwned: status.owned,
      policyValid: canonical.policyValid,
      issues: canonical.issues,
    },
    claude: {
      installed: claude.installed,
      healthy: claude.healthy,
      linkedToCanonical: claude.linkedToCanonical,
      version: claude.version ?? null,
      issues: claude.issues,
    },
    legacy: {
      artifacts: legacy.artifacts,
      inspectionWarnings: legacy.inspectionWarnings,
    },
    skillsCliError: listError,
  };
}

function doctor(context, json) {
  const state = doctorState(context);
  if (json) {
    context.log(JSON.stringify(state, null, 2));
    return state.healthy ? 0 : 1;
  }
  if (state.canonical.installed) {
    context.log(`Flutter Rules: ${state.canonical.version || 'unknown version'}`);
  } else {
    context.log('Flutter Rules is not installed.');
  }
  context.log(`Source: ${state.canonical.source || 'not registered'}`);
  context.log(`Claude Code: ${state.claude.installed ? 'installed' : 'not installed'}`);
  for (const issue of state.canonical.issues) context.error(`Issue: ${issue}`);
  for (const issue of state.claude.issues) context.error(`Issue: Claude Code integration: ${issue}`);
  if (!state.canonical.sourceOwned) context.error('Issue: Skills CLI source is missing or unexpected.');
  else if (!state.canonical.sourceValid) {
    context.error(`Issue: Skills CLI source is pinned to ${state.canonical.source}; run \`flutter-rules update\`.`);
  }
  for (const artifact of state.legacy.artifacts) context.error(`Issue: legacy ${artifact.kind} remains.`);
  for (const warning of state.legacy.inspectionWarnings) context.error(`Issue: ${warning}`);
  if (state.skillsCliError) context.error(`Issue: ${state.skillsCliError}`);
  context.log(state.healthy ? 'Status: healthy' : 'Status: unhealthy');
  return state.healthy ? 0 : 1;
}

function uninstallManaged(context) {
  const { dryRun, env, error, home, log, manager, runner, version } = context;
  const preflight = preflightCanonical({ home, manager });
  const claudePath = claudeDestination(home, env);
  preflightClaude({ home, env, version, canonicalPath: preflight.canonicalPath });
  manager.uninstall();
  if (!dryRun && pathEntryExists(claudePath)) {
    try {
      rmSync(claudePath, { recursive: true, force: true });
    } catch (reason) {
      error(`Warning: Could not remove the Claude Code integration: ${reason instanceof Error ? reason.message : String(reason)}`);
      error('Uninstall is incomplete; the canonical skill was preserved to avoid a dangling Claude integration.');
      return 1;
    }
  }
  const canonicalPath = agentsDestination(home);
  const cleanup = cleanupLegacy({
    home,
    runner,
    canonicalPath,
    additionalPaths: legacyAdditionalPaths(home, env),
    dryRun,
  });
  reportCleanup(cleanup, { dryRun, log, error });
  if (pathEntryExists(canonicalPath)) {
    if (isOwnedSkillDirectory(canonicalPath)) {
      if (!dryRun) rmSync(canonicalPath, { recursive: true, force: true });
    } else {
      error(`Warning: Preserved unrecognized canonical path: ${canonicalPath}`);
    }
  }
  log(`${dryRun ? 'Would uninstall' : 'Uninstalled'} Flutter Rules.`);
  return 0;
}

export async function runCli(argv, {
  env = process.env,
  packageRoot = PACKAGE_ROOT,
  home = env.FLUTTER_RULES_INSTALL_HOME || homedir(),
  runner,
  log = console.log,
  error = console.error,
} = {}) {
  const { values, dryRun, json } = parseArgs(argv);
  if (values.length === 0 || values.includes('--help')) {
    log(HELP.trimEnd());
    return 0;
  }
  if (values.includes('--version')) {
    log(packageVersion(packageRoot));
    return 0;
  }

  const [command, target, ...extra] = values;
  const normalized = normalizeCommand({ command, target, extra, log: json ? error : log });
  if (normalized.command === 'setup') {
    log(DEVIN_SETUP.trimEnd());
    return 0;
  }
  if (json && normalized.command !== 'doctor') throw new Error('`--json` is only supported with `doctor`.');
  if (dryRun && normalized.command === 'doctor') throw new Error('`--dry-run` is not supported with `doctor`.');

  const version = packageVersion(packageRoot);
  const effectiveEnv = scopedEnvironment(env, home);
  const commandRunner = runner || createCommandRunner({
    dryRun,
    env: effectiveEnv,
    stdout: { write: (message) => log(message.trimEnd()) },
    stderr: { write: (message) => error(message.trimEnd()) },
  });
  const manager = createSkillsManager({ runner: commandRunner, version, env: effectiveEnv });
  const context = {
    dryRun,
    env: effectiveEnv,
    error,
    home,
    log,
    manager,
    packageRoot,
    runner: commandRunner,
    version,
  };

  if (normalized.command === 'install' && normalized.target === 'claude') return installClaude(context);
  if (normalized.command === 'install') return installShared(context);
  if (normalized.command === 'update') return updateManaged(context);
  if (normalized.command === 'doctor') return doctor(context, json);
  if (normalized.command === 'uninstall') return uninstallManaged(context);
  throw new Error(`Unsupported command: ${normalized.command}`);
}

export { DEVIN_SETUP, HELP, parseArgs };
