import {
  existsSync,
  lstatSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isOwnedSkillDirectory } from './skill-inspector.mjs';

const CODEX_MARKETPLACE = 'flutter-rules';
const CODEX_PLUGIN = 'flutter-rules@flutter-rules';

function parseJson(result, label) {
  try {
    return JSON.parse(result.stdout || '{}');
  } catch {
    throw new Error(`Could not parse ${label} JSON output.`);
  }
}

function failure(command, result) {
  const details = result.stderr?.trim() || result.stdout?.trim() || `exit code ${result.code}`;
  return new Error(`${command} failed: ${details}`);
}

function runRequired(runner, command, args) {
  const result = runner.run(command, args, { quiet: true });
  if (result.code !== 0) throw failure(`${command} ${args.join(' ')}`, result);
  return result;
}

function entriesFrom(payload, collections) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  return collections.flatMap((key) => Array.isArray(payload[key]) ? payload[key] : []);
}

function pluginEntryMatches(entry) {
  if (entry === CODEX_PLUGIN) return true;
  if (!entry || typeof entry !== 'object') return false;
  const identifier = entry.pluginId ?? entry.id;
  if (identifier) return identifier === CODEX_PLUGIN;
  const marketplace = entry.marketplaceName ?? entry.marketplace;
  return entry.name === CODEX_MARKETPLACE && marketplace === CODEX_MARKETPLACE;
}

function matchingPluginEntries(payload) {
  return entriesFrom(payload, ['installed', 'plugins']).filter(pluginEntryMatches);
}

function hasMarketplace(payload) {
  return entriesFrom(payload, ['marketplaces']).some((entry) =>
    entry === CODEX_MARKETPLACE || entry?.name === CODEX_MARKETPLACE,
  );
}

function entryScope(entry) {
  return typeof entry === 'object' ? entry.scope ?? 'user' : 'user';
}

function linkTargets(path, target) {
  try {
    if (!lstatSync(path).isSymbolicLink()) return false;
    return resolve(dirname(path), readlinkSync(path)) === resolve(target);
  } catch {
    return false;
  }
}

function sameRealPath(left, right) {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return false;
  }
}

function candidatePaths(home, additionalPaths, warnings) {
  const candidates = [
    ...additionalPaths,
    join(home, '.cursor', 'skills', 'flutter-rules'),
    join(home, '.codex', 'skills', 'flutter-rules'),
    join(home, '.config', 'devin', 'skills', 'flutter-rules'),
    join(home, '.claude', 'skills', 'flutter-rules'),
    join(home, '.cursor', 'skills', 'flutter-rules.rendered'),
    join(home, '.agents', 'skills', 'flutter-rules.rendered'),
  ];
  for (const parent of [join(home, '.cursor', 'skills'), join(home, '.agents', 'skills')]) {
    if (!existsSync(parent)) continue;
    try {
      for (const name of readdirSync(parent)) {
        if (name.startsWith('flutter-rules.backup.')) candidates.push(join(parent, name));
      }
    } catch (reason) {
      warnings.push(`Could not inspect legacy directory ${parent}: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  }
  return [...new Set(candidates)];
}

function inspectFilesystem(home, canonicalPath, managedPaths, additionalPaths) {
  const artifacts = [];
  const warnings = [];
  for (const path of candidatePaths(home, additionalPaths, warnings)) {
    if (!existsSync(path) && !linkTargets(path, canonicalPath)) continue;
    const managed = managedPaths.some((candidate) =>
      resolve(candidate) === resolve(path) || sameRealPath(path, candidate) || linkTargets(path, candidate),
    );
    if (managed || sameRealPath(path, canonicalPath) || linkTargets(path, canonicalPath)) continue;
    if (isOwnedSkillDirectory(path)) artifacts.push({ kind: 'directory', path });
    else warnings.push(`Preserved unrecognized legacy path: ${path}`);
  }
  return { artifacts, warnings };
}

function inspectCodex(runner) {
  const artifacts = [];
  const warnings = [];
  if (!runner.has('codex')) return { artifacts, warnings, pluginEntries: [], marketplace: false };
  try {
    const plugins = parseJson(
      runRequired(runner, 'codex', ['plugin', 'list', '--json']),
      'Codex plugin',
    );
    const pluginEntries = matchingPluginEntries(plugins);
    if (pluginEntries.some((entry) => entryScope(entry) === 'user')) {
      artifacts.push({ kind: 'codex-plugin', id: CODEX_PLUGIN });
    }
    if (pluginEntries.some((entry) => entryScope(entry) !== 'user')) {
      warnings.push('Preserved a non-user-scoped legacy Codex plugin.');
    }
    const marketplaces = parseJson(
      runRequired(runner, 'codex', ['plugin', 'marketplace', 'list', '--json']),
      'Codex marketplace',
    );
    const marketplace = hasMarketplace(marketplaces);
    if (marketplace && !pluginEntries.some((entry) => entryScope(entry) !== 'user')) {
      artifacts.push({ kind: 'codex-marketplace', name: CODEX_MARKETPLACE });
    }
    return { artifacts, warnings, pluginEntries, marketplace };
  } catch (reason) {
    warnings.push(`Could not inspect legacy Codex state: ${reason instanceof Error ? reason.message : String(reason)}`);
    return { artifacts, warnings, pluginEntries: [], marketplace: false };
  }
}

function inspectClaude(runner) {
  const artifacts = [];
  const warnings = [];
  if (!runner.has('claude')) return { artifacts, warnings, pluginEntries: [], marketplace: false };
  try {
    const plugins = parseJson(
      runRequired(runner, 'claude', ['plugin', 'list', '--json']),
      'Claude plugin',
    );
    const pluginEntries = matchingPluginEntries(plugins);
    if (pluginEntries.some((entry) => entryScope(entry) === 'user')) {
      artifacts.push({ kind: 'claude-plugin', id: CODEX_PLUGIN });
    }
    if (pluginEntries.some((entry) => entryScope(entry) !== 'user')) {
      warnings.push('Preserved a non-user-scoped legacy Claude plugin.');
    }
    const marketplaces = parseJson(
      runRequired(runner, 'claude', ['plugin', 'marketplace', 'list', '--json']),
      'Claude marketplace',
    );
    const marketplace = hasMarketplace(marketplaces);
    if (marketplace && !pluginEntries.some((entry) => entryScope(entry) !== 'user')) {
      artifacts.push({ kind: 'claude-marketplace', name: CODEX_MARKETPLACE });
    }
    return { artifacts, warnings, pluginEntries, marketplace };
  } catch (reason) {
    warnings.push(`Could not inspect legacy Claude state: ${reason instanceof Error ? reason.message : String(reason)}`);
    return { artifacts, warnings, pluginEntries: [], marketplace: false };
  }
}

export function inspectLegacy({ home, runner, canonicalPath, managedPaths = [], additionalPaths = [] }) {
  const filesystem = inspectFilesystem(home, canonicalPath, managedPaths, additionalPaths);
  const codex = inspectCodex(runner);
  const claude = inspectClaude(runner);
  return {
    artifacts: [...filesystem.artifacts, ...codex.artifacts, ...claude.artifacts],
    inspectionWarnings: [...filesystem.warnings, ...codex.warnings, ...claude.warnings],
  };
}

export function cleanupLegacy({ home, runner, canonicalPath, managedPaths = [], additionalPaths = [], dryRun = false }) {
  const state = inspectLegacy({ home, runner, canonicalPath, managedPaths, additionalPaths });
  const removed = [];
  const warnings = [...state.inspectionWarnings];

  for (const artifact of state.artifacts) {
    try {
      if (artifact.kind === 'directory') {
        if (!dryRun) rmSync(artifact.path, { recursive: true, force: true });
      } else if (artifact.kind === 'codex-plugin') {
        if (!dryRun) runRequired(runner, 'codex', ['plugin', 'remove', CODEX_PLUGIN]);
      } else if (artifact.kind === 'codex-marketplace') {
        if (!dryRun) runRequired(runner, 'codex', ['plugin', 'marketplace', 'remove', CODEX_MARKETPLACE]);
      } else if (artifact.kind === 'claude-plugin') {
        if (!dryRun) runRequired(runner, 'claude', ['plugin', 'uninstall', CODEX_PLUGIN, '--scope', 'user']);
      } else if (artifact.kind === 'claude-marketplace') {
        if (!dryRun) runRequired(runner, 'claude', ['plugin', 'marketplace', 'remove', CODEX_MARKETPLACE]);
      }
      removed.push(artifact);
    } catch (reason) {
      warnings.push(`Could not remove ${artifact.kind}: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  }

  return { removed, warnings };
}
