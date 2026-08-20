import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCommandRunner } from './command-runner.mjs';
import { removeDirectory } from './fs-utils.mjs';
import { frontmatterField, frontmatterMetadataField, renderSkill } from './render-skill.mjs';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CODEX_MARKETPLACE = 'flutter-rules';
const CODEX_PLUGIN = 'flutter-rules@flutter-rules';
const AGENTS_SUFFIX = join('.agents', 'skills', 'flutter-rules');
const CLAUDE_SUFFIX = join('.claude', 'skills', 'flutter-rules');
const LEGACY_CURSOR_SUFFIX = join('.cursor', 'skills', 'flutter-rules');

const HELP = `Usage:
  flutter-rules install <agents|claude|all>
  flutter-rules update <agents|claude|all>
  flutter-rules uninstall <agents|claude|all>
  flutter-rules doctor <agents|claude|all>
  flutter-rules setup devin  # Deprecated; use install agents

Compatibility aliases:
  codex, cursor, and devin map to the shared agents target.

Options:
  --dry-run       Print actions without changing files or running tools.
  --version       Print the CLI version.
  --help          Show this help.
`;

const DEVIN_SETUP = `\`setup devin\` is deprecated.
Run: flutter-rules install agents

This installs one shared user-level skill for Codex, Cursor, and Devin Local and does not modify a project directory.
`;

function packageVersion(packageRoot = PACKAGE_ROOT) {
  return JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;
}

function parseArgs(argv) {
  const values = [];
  let dryRun = false;
  for (const value of argv) {
    if (value === '--dry-run') dryRun = true;
    else if (value.startsWith('-') && !['--help', '--version'].includes(value)) {
      throw new Error(`Unknown option: ${value}`);
    } else values.push(value);
  }
  return { values, dryRun };
}

function parseJson(result, label) {
  try {
    return JSON.parse(result.stdout || '{}');
  } catch {
    throw new Error(`Could not parse ${label} JSON output.`);
  }
}

function commandFailure(command, result) {
  const details = result.stderr?.trim() || result.stdout?.trim() || `exit code ${result.code}`;
  return new Error(`${command} failed: ${details}`);
}

function runRequired(runner, command, args) {
  const result = runner.run(command, args);
  if (result.code !== 0) throw commandFailure(`${command} ${args.join(' ')}`, result);
  return result;
}

function entriesFrom(payload, collections) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  return collections.flatMap((key) => Array.isArray(payload[key]) ? payload[key] : []);
}

function hasMarketplaceEntry(payload) {
  return entriesFrom(payload, ['marketplaces']).some((entry) =>
    entry === CODEX_MARKETPLACE || entry?.name === CODEX_MARKETPLACE,
  );
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

function hasPluginEntry(payload, scope) {
  return matchingPluginEntries(payload).some((entry) =>
    !scope || (typeof entry === 'object' ? entry.scope ?? 'user' : 'user') === scope,
  );
}

function marketplaceExists(runner, command) {
  const result = runner.run(command, ['plugin', 'marketplace', 'list', '--json'], { quiet: true });
  if (result.code !== 0) throw commandFailure(`${command} plugin marketplace list`, result);
  return hasMarketplaceEntry(parseJson(result, `${command} marketplace`));
}

function pluginList(runner, command) {
  const result = runner.run(command, ['plugin', 'list', '--json'], { quiet: true });
  if (result.code !== 0) throw commandFailure(`${command} plugin list`, result);
  return parseJson(result, `${command} plugin`);
}

function hasPluginOutsideUserScope(payload) {
  return matchingPluginEntries(payload).some((entry) =>
    typeof entry === 'object' && entry.scope && entry.scope !== 'user',
  );
}

function cleanupCodexPlugin(runner) {
  if (!runner.has('codex')) return null;
  try {
    const plugins = pluginList(runner, 'codex');
    const hasOtherScope = hasPluginOutsideUserScope(plugins);
    if (hasPluginEntry(plugins, 'user')) {
      runRequired(runner, 'codex', ['plugin', 'remove', CODEX_PLUGIN]);
    }
    if (!hasOtherScope && marketplaceExists(runner, 'codex')) {
      runRequired(runner, 'codex', ['plugin', 'marketplace', 'remove', CODEX_MARKETPLACE]);
    }
    return hasOtherScope
      ? 'A legacy Codex plugin remains outside user scope; remove that scoped installation explicitly.'
      : null;
  } catch (reason) {
    return `Could not clean up the legacy Codex plugin: ${reason instanceof Error ? reason.message : String(reason)}`;
  }
}

function cleanupClaudePlugin(runner) {
  if (!runner.has('claude')) return null;
  try {
    const plugins = pluginList(runner, 'claude');
    const hasOtherScope = hasPluginOutsideUserScope(plugins);
    if (hasPluginEntry(plugins, 'user')) {
      runRequired(runner, 'claude', ['plugin', 'uninstall', CODEX_PLUGIN, '--scope', 'user']);
    }
    if (!hasOtherScope && marketplaceExists(runner, 'claude')) {
      runRequired(runner, 'claude', ['plugin', 'marketplace', 'remove', CODEX_MARKETPLACE]);
    }
    return hasOtherScope
      ? 'A legacy Claude plugin remains outside user scope; remove that scoped installation explicitly.'
      : null;
  } catch (reason) {
    return `Could not clean up the legacy Claude plugin: ${reason instanceof Error ? reason.message : String(reason)}`;
  }
}

function agentsDestination(home) {
  return join(home, AGENTS_SUFFIX);
}

function claudeDestination(home) {
  return join(home, CLAUDE_SUFFIX);
}

function legacyCursorDestination(home) {
  return join(home, LEGACY_CURSOR_SUFFIX);
}

function renderStandalone({ home, packageRoot, dryRun, mode, log, platform }) {
  const source = join(packageRoot, 'src', 'flutter-rules');
  const destination = platform === 'agents' ? agentsDestination(home) : claudeDestination(home);
  renderSkill({ source, destination, platform, dryRun });
  if (dryRun) log(`DRY RUN: render ${source} -> ${destination}`);
  const action = dryRun
    ? `Would ${mode === 'update' ? 'update' : 'install'}`
    : mode === 'update' ? 'Updated' : 'Installed';
  const label = platform === 'agents'
    ? 'shared Codex, Cursor, and Devin skill'
    : 'Claude Code standalone skill';
  return `${action} ${label} at ${destination}.`;
}

function reportCleanupWarning(log, warning) {
  if (warning) log(`Warning: ${warning}`);
}

function cleanupLegacyCursor({ dryRun, home, log }) {
  const legacy = legacyCursorDestination(home);
  if (!existsSync(legacy)) return null;
  try {
    removeDirectory({ destination: legacy, expectedSuffix: legacy, dryRun });
    if (dryRun) log(`DRY RUN: remove legacy Cursor skill at ${legacy}`);
    return null;
  } catch (reason) {
    return `Could not remove the legacy Cursor skill: ${reason instanceof Error ? reason.message : String(reason)}`;
  }
}

function installAgents(context) {
  const { log, runner } = context;
  const message = renderStandalone({ ...context, platform: 'agents' });
  reportCleanupWarning(log, cleanupLegacyCursor(context));
  reportCleanupWarning(log, cleanupCodexPlugin(runner));
  return message;
}

function installClaude(context) {
  const message = renderStandalone({ ...context, platform: 'claude' });
  reportCleanupWarning(context.log, cleanupClaudePlugin(context.runner));
  return message;
}

function uninstallAgents({ dryRun, home, log, runner }) {
  const destination = agentsDestination(home);
  removeDirectory({ destination, expectedSuffix: destination, dryRun });
  reportCleanupWarning(log, cleanupLegacyCursor({ dryRun, home, log }));
  reportCleanupWarning(log, cleanupCodexPlugin(runner));
  return `${dryRun ? 'Would uninstall' : 'Uninstalled'} shared Codex, Cursor, and Devin skill.`;
}

function uninstallClaude({ dryRun, home, log, runner }) {
  const destination = claudeDestination(home);
  removeDirectory({ destination, expectedSuffix: destination, dryRun });
  reportCleanupWarning(log, cleanupClaudePlugin(runner));
  return `${dryRun ? 'Would uninstall' : 'Uninstalled'} Claude Code standalone skill.`;
}

function skillVersion(content) {
  return frontmatterMetadataField(content, 'version');
}

function hasExplicitInvocationMetadata(content, requireTriggers) {
  try {
    return frontmatterField(content, 'disable-model-invocation') === 'true'
      && (!requireTriggers || frontmatterField(content, 'triggers') === '["user"]');
  } catch {
    return false;
  }
}

function hasCodexManualPolicy(content) {
  const lines = content.replaceAll('\r\n', '\n').split('\n');
  const policies = lines
    .map((line, index) => line === 'policy:' ? index : -1)
    .filter((index) => index >= 0);
  if (policies.length !== 1) return false;
  const values = [];
  for (let index = policies[0] + 1; index < lines.length; index += 1) {
    if (lines[index] && !/^\s/.test(lines[index])) break;
    const match = lines[index].match(/^  allow_implicit_invocation:\s*(\S+)\s*$/);
    if (match) values.push(match[1]);
  }
  return values.length === 1 && values[0] === 'false';
}

function standaloneStatus({ destination, expectedVersion, label, requireCodexPolicy, requireTriggers }) {
  const skillPath = join(destination, 'SKILL.md');
  if (!existsSync(skillPath)) return `${label} is not installed.`;
  const content = readFileSync(skillPath, 'utf8');
  if (!hasExplicitInvocationMetadata(content, requireTriggers)) {
    return `${label} has incomplete explicit-invocation metadata. Run \`flutter-rules update all\`.`;
  }
  const version = skillVersion(content);
  if (!version) return `${label} version metadata is missing. Run \`flutter-rules update all\`.`;
  if (version !== expectedVersion) {
    return `${label} is outdated (${version}; expected ${expectedVersion}). Run \`flutter-rules update all\`.`;
  }
  if (requireCodexPolicy) {
    const policyPath = join(destination, 'agents', 'openai.yaml');
    if (!existsSync(policyPath) || !hasCodexManualPolicy(readFileSync(policyPath, 'utf8'))) {
      return `${label} is missing the Codex manual-invocation policy. Run \`flutter-rules update agents\`.`;
    }
  }
  return `${label} is installed at version ${version}.`;
}

function legacyConfigurationStatus(runner, command) {
  if (!runner.has(command)) return null;
  try {
    const plugins = pluginList(runner, command);
    if (hasPluginOutsideUserScope(plugins)) {
      return `A legacy ${command} plugin remains outside user scope; remove that scoped installation explicitly.`;
    }
    if (hasPluginEntry(plugins, 'user') || marketplaceExists(runner, command)) {
      return `A duplicate legacy ${command} plugin or marketplace remains. Run \`flutter-rules update ${command === 'codex' ? 'agents' : 'claude'}\`.`;
    }
    return null;
  } catch (reason) {
    return `Could not inspect legacy ${command} plugin state: ${reason instanceof Error ? reason.message : String(reason)}`;
  }
}

function doctorAgents({ home, packageRoot, runner }) {
  const label = 'Shared Codex, Cursor, and Devin skill';
  const status = standaloneStatus({
    destination: agentsDestination(home),
    expectedVersion: packageVersion(packageRoot),
    label,
    requireCodexPolicy: true,
    requireTriggers: true,
  });
  if (!status.includes(' is installed at version ')) return status;
  if (existsSync(legacyCursorDestination(home))) {
    return `${label} has a duplicate legacy Cursor copy. Run \`flutter-rules update agents\`.`;
  }
  const legacyStatus = legacyConfigurationStatus(runner, 'codex');
  return legacyStatus ? `${status} ${legacyStatus}` : status;
}

function doctorClaude({ home, packageRoot, runner }) {
  const label = 'Claude Code standalone skill';
  const status = standaloneStatus({
    destination: claudeDestination(home),
    expectedVersion: packageVersion(packageRoot),
    label,
    requireCodexPolicy: false,
    requireTriggers: false,
  });
  if (!status.includes(' is installed at version ')) return status;
  const legacyStatus = legacyConfigurationStatus(runner, 'claude');
  return legacyStatus ? `${status} ${legacyStatus}` : status;
}

const agentsHandlers = {
  install: installAgents,
  update: installAgents,
  uninstall: uninstallAgents,
  doctor: doctorAgents,
};

const handlers = {
  agents: agentsHandlers,
  codex: agentsHandlers,
  cursor: agentsHandlers,
  devin: agentsHandlers,
  claude: { install: installClaude, update: installClaude, uninstall: uninstallClaude, doctor: doctorClaude },
};

function printDevinSetup(log) {
  log(DEVIN_SETUP.trimEnd());
}

async function runOne({ command, target, context, log }) {
  const handler = handlers[target]?.[command];
  if (!handler) throw new Error(`Unsupported target: ${target}`);
  return handler({ ...context, mode: command, log });
}

async function runAll({ command, context, log, error }) {
  const results = [];
  for (const target of ['agents', 'claude']) {
    try {
      const message = await runOne({ command, target, context, log });
      results.push({ target, ok: true, message });
      log(`${target}: ${message}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      results.push({ target, ok: false, message });
      error(`${target}: ${message}`);
    }
  }
  return results.every((result) => result.ok) ? 0 : 1;
}

export async function runCli(argv, {
  env = process.env,
  packageRoot = PACKAGE_ROOT,
  home = env.FLUTTER_RULES_INSTALL_HOME || homedir(),
  runner,
  log = console.log,
  error = console.error,
} = {}) {
  const { values, dryRun: flagDryRun } = parseArgs(argv);
  if (values.length === 0 || values.includes('--help')) {
    log(HELP.trimEnd());
    return 0;
  }
  if (values.includes('--version')) {
    log(packageVersion(packageRoot));
    return 0;
  }

  const [command, target, ...extra] = values;
  if (!['install', 'update', 'uninstall', 'doctor', 'setup'].includes(command)) {
    throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }
  if (!target) throw new Error(`Expected a target.\n\n${HELP}`);
  if (extra.length > 0) throw new Error(`Unexpected argument${extra.length > 1 ? 's' : ''}: ${extra.join(' ')}\n\n${HELP}`);
  if (command === 'setup' && target !== 'devin') throw new Error('Only `setup devin` is supported.');
  if (command !== 'setup' && !['agents', 'codex', 'claude', 'cursor', 'all', 'devin'].includes(target)) {
    throw new Error(`Unsupported target: ${target}\n\n${HELP}`);
  }
  if (command === 'setup') {
    printDevinSetup(log);
    return 0;
  }

  const dryRun = flagDryRun || env.FLUTTER_RULES_DRY_RUN === '1';
  const commandRunner = dryRun
    ? createCommandRunner({
      dryRun: true,
      env,
      stdout: { write: (message) => log(message.trimEnd()) },
      stderr: { write: (message) => error(message.trimEnd()) },
    })
    : runner || createCommandRunner({ dryRun: false, env });
  const context = {
    home,
    packageRoot,
    dryRun,
    runner: commandRunner,
  };
  if (target === 'all') return runAll({ command, context, log, error });
  const message = await runOne({ command, target, context, log });
  log(message);
  return 0;
}

export { DEVIN_SETUP, HELP, handlers, parseArgs };
