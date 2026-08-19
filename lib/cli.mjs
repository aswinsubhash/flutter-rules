import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCommandRunner } from './command-runner.mjs';
import { installDirectory, removeDirectory } from './fs-utils.mjs';
import { renderSkill } from './render-skill.mjs';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CODEX_MARKETPLACE = 'flutter-rules';
const CODEX_PLUGIN = 'flutter-rules@flutter-rules';
const CODEX_SOURCE = 'aswinsubhash/flutter-rules';
const CURSOR_SUFFIX = join('.cursor', 'skills', 'flutter-rules');
const DEVIN_SUFFIX = join('.agents', 'skills', 'flutter-rules');

const HELP = `Usage:
  flutter-rules install <codex|claude|cursor|devin|all>
  flutter-rules update <codex|claude|cursor|devin|all>
  flutter-rules uninstall <codex|claude|cursor|devin|all>
  flutter-rules doctor <codex|claude|cursor|devin|all>
  flutter-rules setup devin  # Deprecated; use install devin

Options:
  --dry-run       Print actions without changing files or running tools.
  --version       Print the CLI version.
  --help          Show this help.
`;

const DEVIN_SETUP = `\`setup devin\` is deprecated.
Run: flutter-rules install devin

This installs Flutter Rules for Devin Local at user scope and does not modify a project directory.
`;

function packageVersion(packageRoot = PACKAGE_ROOT) {
  return JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;
}

function parseArgs(argv) {
  const values = [];
  let dryRun = false;
  for (const value of argv) {
    if (value === '--dry-run') dryRun = true;
    else values.push(value);
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

function hasNamedEntry(payload, name, keys = ['name', 'pluginId']) {
  const values = [];
  const collect = (value) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (typeof value === 'string' && (value === name || value.startsWith(`${name}@`))) values.push(value);
    else if (value && typeof value === 'object') {
      if (keys.some((key) => value[key] === name || value[key]?.startsWith?.(`${name}@`))) values.push(value);
      Object.values(value).forEach(collect);
    }
  };
  collect(payload);
  return values.length > 0;
}

function marketplaceExists(runner, command) {
  const result = runner.run(command, ['plugin', 'marketplace', 'list', '--json'], { quiet: true });
  if (result.code !== 0) throw commandFailure(`${command} plugin marketplace list`, result);
  return hasNamedEntry(parseJson(result, `${command} marketplace`), CODEX_MARKETPLACE, ['name']);
}

function pluginExists(runner, command) {
  const result = runner.run(command, ['plugin', 'list', '--json'], { quiet: true });
  if (result.code !== 0) throw commandFailure(`${command} plugin list`, result);
  return hasNamedEntry(parseJson(result, `${command} plugin`), CODEX_MARKETPLACE, ['name', 'pluginId']);
}

function requireCommand(runner, command, guidance) {
  if (!runner.has(command)) throw new Error(`${command} CLI was not found. ${guidance}`);
}

function localSource(value) {
  return existsSync(resolve(value));
}

function codexSource(env) {
  return env.FLUTTER_RULES_CODEX_MARKETPLACE_SOURCE || CODEX_SOURCE;
}

function installCodex({ runner, env, mode }) {
  requireCommand(runner, 'codex', 'Install Codex, then rerun this command.');
  const source = codexSource(env);
  const configured = marketplaceExists(runner, 'codex');
  if (configured) {
    runRequired(runner, 'codex', ['plugin', 'marketplace', 'upgrade', CODEX_MARKETPLACE]);
  } else {
    const args = ['plugin', 'marketplace', 'add', source];
    if (!localSource(source)) args.push('--ref', 'main');
    runRequired(runner, 'codex', args);
  }
  runRequired(runner, 'codex', ['plugin', 'add', CODEX_PLUGIN]);
  return `${runner.dryRun ? 'Would ' : ''}${mode === 'update' ? 'update' : 'install'} Codex plugin.`;
}

function uninstallCodex({ runner }) {
  requireCommand(runner, 'codex', 'Install Codex, then rerun this command.');
  if (pluginExists(runner, 'codex')) runRequired(runner, 'codex', ['plugin', 'remove', CODEX_PLUGIN]);
  if (marketplaceExists(runner, 'codex')) runRequired(runner, 'codex', ['plugin', 'marketplace', 'remove', CODEX_MARKETPLACE]);
  return `${runner.dryRun ? 'Would uninstall' : 'Uninstalled'} Codex plugin.`;
}

function doctorCodex({ runner }) {
  requireCommand(runner, 'codex', 'Install Codex, then rerun this command.');
  return pluginExists(runner, 'codex') ? 'Codex plugin is installed.' : 'Codex plugin is not installed.';
}

function installClaude({ runner, mode }) {
  requireCommand(runner, 'claude', 'Install Claude Code, then rerun this command.');
  const result = runner.run('claude', ['plugin', 'marketplace', 'list', '--json'], { quiet: true });
  if (result.code !== 0) throw commandFailure('claude plugin marketplace list', result);
  const configured = hasNamedEntry(parseJson(result, 'Claude marketplace'), CODEX_MARKETPLACE, ['name']);
  if (configured) {
    runRequired(runner, 'claude', ['plugin', 'marketplace', 'update', CODEX_MARKETPLACE]);
  } else {
    runRequired(runner, 'claude', ['plugin', 'marketplace', 'add', CODEX_SOURCE]);
  }
  runRequired(runner, 'claude', ['plugin', mode === 'update' ? 'update' : 'install', CODEX_PLUGIN, '--scope', 'user']);
  return `${runner.dryRun ? 'Would ' : ''}${mode === 'update' ? 'update' : 'install'} Claude Code plugin.`;
}

function uninstallClaude({ runner }) {
  requireCommand(runner, 'claude', 'Install Claude Code, then rerun this command.');
  const plugins = runner.run('claude', ['plugin', 'list', '--json'], { quiet: true });
  if (plugins.code !== 0) throw commandFailure('claude plugin list', plugins);
  if (hasNamedEntry(parseJson(plugins, 'Claude plugin'), CODEX_MARKETPLACE, ['name', 'pluginId'])) {
    runRequired(runner, 'claude', ['plugin', 'uninstall', CODEX_PLUGIN, '--scope', 'user']);
  }
  const marketplaces = runner.run('claude', ['plugin', 'marketplace', 'list', '--json'], { quiet: true });
  if (marketplaces.code !== 0) throw commandFailure('claude plugin marketplace list', marketplaces);
  if (hasNamedEntry(parseJson(marketplaces, 'Claude marketplace'), CODEX_MARKETPLACE, ['name'])) {
    runRequired(runner, 'claude', ['plugin', 'marketplace', 'remove', CODEX_MARKETPLACE]);
  }
  return `${runner.dryRun ? 'Would uninstall' : 'Uninstalled'} Claude Code plugin.`;
}

function doctorClaude({ runner }) {
  requireCommand(runner, 'claude', 'Install Claude Code, then rerun this command.');
  const result = runner.run('claude', ['plugin', 'list', '--json'], { quiet: true });
  if (result.code !== 0) throw commandFailure('claude plugin list', result);
  return hasNamedEntry(parseJson(result, 'Claude plugin'), CODEX_MARKETPLACE, ['name', 'pluginId'])
    ? 'Claude Code plugin is installed.'
    : 'Claude Code plugin is not installed.';
}

function cursorDestination(home) {
  return join(home, CURSOR_SUFFIX);
}

function installCursor({ runner, home, packageRoot, dryRun, mode }) {
  const source = join(packageRoot, 'src', 'flutter-rules');
  const destination = cursorDestination(home);
  renderSkill({ source, destination: `${destination}.rendered`, platform: 'cursor', dryRun });
  if (!dryRun) {
    installDirectory({ source: `${destination}.rendered`, destination, dryRun });
    removeDirectory({ destination: `${destination}.rendered`, expectedSuffix: `${destination}.rendered` });
  }
  return `${dryRun ? `Would ${mode === 'update' ? 'update' : 'install'}` : mode === 'update' ? 'Updated' : 'Installed'} Cursor skill at ${destination}.`;
}

function uninstallCursor({ home, dryRun }) {
  const destination = cursorDestination(home);
  removeDirectory({ destination, expectedSuffix: destination, dryRun });
  return `${dryRun ? 'Would uninstall' : 'Uninstalled'} Cursor skill.`;
}

function doctorCursor({ home }) {
  return doctorFilesystemSkill({ home, target: 'cursor' });
}

function devinDestination(home) {
  return join(home, DEVIN_SUFFIX);
}

function installDevin({ home, packageRoot, dryRun, mode }) {
  const source = join(packageRoot, 'src', 'flutter-rules');
  const destination = devinDestination(home);
  renderSkill({ source, destination: `${destination}.rendered`, platform: 'devin', dryRun });
  if (!dryRun) {
    installDirectory({ source: `${destination}.rendered`, destination, dryRun });
    removeDirectory({ destination: `${destination}.rendered`, expectedSuffix: `${destination}.rendered` });
  }
  return `${dryRun ? `Would ${mode === 'update' ? 'update' : 'install'}` : mode === 'update' ? 'Updated' : 'Installed'} Devin Local skill at ${destination}.`;
}

function uninstallDevin({ home, dryRun }) {
  const destination = devinDestination(home);
  removeDirectory({ destination, expectedSuffix: destination, dryRun });
  return `${dryRun ? 'Would uninstall' : 'Uninstalled'} Devin Local skill.`;
}

function doctorDevin({ home }) {
  return doctorFilesystemSkill({ home, target: 'devin' });
}

function skillVersion(content) {
  return content.match(/^\s+version:\s+["']([^"']+)["']\s*$/m)?.[1] || 'unknown';
}

function hasExplicitInvocationMetadata(content) {
  return /^disable-model-invocation:\s+true\s*$/m.test(content)
    && /^triggers:\s+\["user"\]\s*$/m.test(content);
}

function doctorFilesystemSkill({ home, target }) {
  const cursorPath = join(cursorDestination(home), 'SKILL.md');
  const devinPath = join(devinDestination(home), 'SKILL.md');
  const ownPath = target === 'cursor' ? cursorPath : devinPath;
  const otherPath = target === 'cursor' ? devinPath : cursorPath;
  const label = target === 'cursor' ? 'Cursor' : 'Devin Local';

  if (!existsSync(ownPath)) return `${label} skill is not installed.`;

  const ownContent = readFileSync(ownPath, 'utf8');
  if (!hasExplicitInvocationMetadata(ownContent)) {
    return `${label} skill has incomplete explicit-invocation metadata. Run \`flutter-rules update all\`.`;
  }

  if (!existsSync(otherPath)) return `${label} skill is installed.`;

  const otherContent = readFileSync(otherPath, 'utf8');
  if (!hasExplicitInvocationMetadata(otherContent)) {
    return `Cursor and Devin skill invocation metadata differ. Run \`flutter-rules update all\`.`;
  }
  if (skillVersion(ownContent) !== skillVersion(otherContent)) {
    return `Cursor and Devin skill versions differ (${skillVersion(ownContent)} vs ${skillVersion(otherContent)}). Run \`flutter-rules update all\`.`;
  }
  if (ownContent !== otherContent) {
    return `Cursor and Devin skill copies differ. Run \`flutter-rules update all\`.`;
  }

  return `${label} skill is installed. Cursor and Devin copies are synchronized; Cursor may display the shared .agents path.`;
}

const handlers = {
  codex: { install: installCodex, update: installCodex, uninstall: uninstallCodex, doctor: doctorCodex },
  claude: { install: installClaude, update: installClaude, uninstall: uninstallClaude, doctor: doctorClaude },
  cursor: { install: installCursor, update: installCursor, uninstall: uninstallCursor, doctor: doctorCursor },
  devin: { install: installDevin, update: installDevin, uninstall: uninstallDevin, doctor: doctorDevin },
};

function printDevinSetup(log) {
  log(DEVIN_SETUP.trimEnd());
}

async function runOne({ command, target, context, log }) {
  const handler = handlers[target]?.[command];
  if (!handler) throw new Error(`Unsupported target: ${target}`);
  return handler({ ...context, mode: command });
}

async function runAll({ command, context, log, error }) {
  const results = [];
  for (const target of ['codex', 'claude', 'cursor', 'devin']) {
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
  if (extra.length > 0 || !target) throw new Error(`Expected a target.\n\n${HELP}`);
  if (command === 'setup' && target !== 'devin') throw new Error('Only `setup devin` is supported.');
  if (command !== 'setup' && !['codex', 'claude', 'cursor', 'all', 'devin'].includes(target)) {
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
    env,
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
