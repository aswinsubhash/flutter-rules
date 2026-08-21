#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT_EXCEPTION = 'allow-root-test';
const MANUAL_BLOC_EXCEPTION = 'allow-manual-bloc-test';

function normalizePath(path) {
  return path.split(sep).join('/');
}

function projectPath(value, projectRoot) {
  const absolute = isAbsolute(value) ? resolve(value) : resolve(projectRoot, value);
  const path = normalizePath(relative(projectRoot, absolute));
  if (!path || path === '..' || path.startsWith('../')) throw new Error(`Path is outside the project: ${value}`);
  return path;
}

function gitPaths(projectRoot, args) {
  const result = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error((result.stderr || 'git command failed').trim());
  return result.stdout.split('\0').filter(Boolean).map(normalizePath);
}

export function changedDartFiles(projectRoot) {
  let tracked;
  try {
    tracked = gitPaths(projectRoot, ['diff', '--name-only', '--diff-filter=ACMR', '-z', 'HEAD', '--', '*.dart']);
  } catch (error) {
    if (!/unknown revision|ambiguous argument|bad revision/i.test(error.message)) throw error;
    tracked = gitPaths(projectRoot, ['ls-files', '--cached', '-z', '--', '*.dart']);
  }
  const untracked = gitPaths(projectRoot, ['ls-files', '--others', '--exclude-standard', '-z', '--', '*.dart']);
  return [...new Set([...tracked, ...untracked])].sort();
}

function packageName(pubspec) {
  return pubspec.match(/^name:\s*([A-Za-z0-9_-]+)\s*$/m)?.[1] ?? null;
}

function hasDevDependency(pubspec, dependency) {
  const lines = pubspec.replaceAll('\r\n', '\n').split('\n');
  const escapedDependency = dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let inDevDependencies = false;
  for (const line of lines) {
    if (/^dev_dependencies:\s*(?:#.*)?$/.test(line)) {
      inDevDependencies = true;
      continue;
    }
    if (inDevDependencies && /^\S/.test(line) && line.trim() && !/^\s*#/.test(line)) break;
    if (inDevDependencies && new RegExp(`^\\s+${escapedDependency}\\s*:`).test(line)) return true;
  }
  return false;
}

function importsFrom(source, testPath, projectRoot, projectName) {
  const imports = [];
  for (const match of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) {
    const value = match[1];
    if (projectName && value.startsWith(`package:${projectName}/`)) {
      imports.push(`lib/${value.slice(projectName.length + 9)}`);
      continue;
    }
    if (value.startsWith('.')) {
      const resolved = projectPath(resolve(projectRoot, dirname(testPath), value), projectRoot);
      if (resolved.startsWith('lib/')) imports.push(resolved);
    }
  }
  return [...new Set(imports)];
}

function directive(source, name) {
  const pattern = new RegExp(`^\\s*//\\s*flutter-rules:\\s*${name}\\s+--\\s*(\\S.*)$`, 'm');
  const reason = source.match(pattern)?.[1]?.trim();
  return reason && reason.length >= 8 ? reason : null;
}

function expectedProductionPath(testPath) {
  const match = testPath.match(/^test\/(features|core)\/(.+)_test\.dart$/);
  return match ? `lib/${match[1]}/${match[2]}.dart` : null;
}

function expectedTestPath(productionPath) {
  const match = productionPath.match(/^lib\/(features|core)\/(.+)\.dart$/);
  return match ? `test/${match[1]}/${match[2]}_test.dart` : null;
}

function relevantProductionImports(imports) {
  return imports.filter((path) => path.startsWith('lib/features/') || path.startsWith('lib/core/'));
}

function bestExpectedPath(testPath, imports) {
  const basename = testPath.split('/').at(-1).replace(/_test\.dart$/, '.dart');
  const matching = imports.find((path) => path.endsWith(`/${basename}`));
  return expectedTestPath(matching ?? imports[0]);
}

function isTransitionTest(testPath, source, imports) {
  const widgetOnly = /\btestWidgets\s*\(/.test(source) && !/(^|[^A-Za-z])test\s*\(/m.test(source);
  const manualTransition = /\bexpectLater\s*\(/.test(source) && /(?:\.stream\b|\bemits(?:InOrder|Through)?\b)/.test(source);
  if (widgetOnly && !manualTransition && !/\bblocTest\s*</.test(source)) return false;
  const namedForBloc = /_(?:bloc|cubit)_test\.dart$/.test(testPath);
  const importsBloc = imports.some((path) => /_(?:bloc|cubit)\.dart$/.test(path));
  return namedForBloc || manualTransition || (importsBloc && /(^|[^A-Za-z])test\s*\(/m.test(source)) || /\bblocTest\s*</.test(source);
}

function typedBlocTest(source) {
  const pattern = /\bblocTest\s*</g;
  let match;
  while ((match = pattern.exec(source))) {
    let depth = 1;
    let hasTopLevelComma = false;
    for (let index = pattern.lastIndex; index < source.length; index += 1) {
      if (source[index] === '<') depth += 1;
      else if (source[index] === ',' && depth === 1) hasTopLevelComma = true;
      else if (source[index] === '>') {
        depth -= 1;
        if (depth !== 0) continue;
        let callIndex = index + 1;
        while (/\s/.test(source[callIndex] ?? '')) callIndex += 1;
        if (hasTopLevelComma && source[callIndex] === '(') return true;
        break;
      }
    }
  }
  return false;
}

function issue(code, file, message, expected) {
  return { code, file, message, ...(expected ? { expected } : {}) };
}

export function validateTestPolicy({ projectRoot = process.cwd(), files } = {}) {
  const root = resolve(projectRoot);
  const pubspecPath = resolve(root, 'pubspec.yaml');
  if (!existsSync(pubspecPath)) throw new Error(`Flutter project pubspec.yaml not found: ${pubspecPath}`);
  const pubspec = readFileSync(pubspecPath, 'utf8');
  const projectName = packageName(pubspec);
  if (!projectName) throw new Error('pubspec.yaml must define a package name.');

  const candidates = files?.length ? files.map((path) => projectPath(path, root)) : changedDartFiles(root);
  const testFiles = [...new Set(candidates)]
    .filter((path) => path.startsWith('test/') && path.endsWith('_test.dart'))
    .sort();
  const errors = [];
  const exceptions = [];
  const blocTestAvailable = hasDevDependency(pubspec, 'bloc_test');

  for (const file of testFiles) {
    const absolute = resolve(root, file);
    if (!existsSync(absolute)) continue;
    const source = readFileSync(absolute, 'utf8');
    const imports = importsFrom(source, file, root, projectName);
    const productionImports = relevantProductionImports(imports);
    const rootReason = directive(source, ROOT_EXCEPTION);
    const expectedProduction = expectedProductionPath(file);

    if (expectedProduction) {
      const expectedDirectory = `${dirname(expectedProduction)}/`;
      const hasMappedProduction = existsSync(resolve(root, expectedProduction))
        || productionImports.some((path) => path.startsWith(expectedDirectory));
      if (!hasMappedProduction) {
        errors.push(issue('TEST_PATH_UNMAPPED', file, 'Test path does not map to an existing production file or same-layer production import.', expectedProduction));
      }
    } else if (productionImports.length && !rootReason) {
      errors.push(issue(
        'TEST_PATH_NOT_MIRRORED',
        file,
        'Feature and core tests must use the mirrored production path. Root or unrelated test directories are reserved for app-wide behavior.',
        bestExpectedPath(file, productionImports),
      ));
    } else if (rootReason) {
      exceptions.push({ code: 'ROOT_TEST_EXCEPTION', file, reason: rootReason });
    }

    if (!isTransitionTest(file, source, imports)) continue;
    const manualReason = directive(source, MANUAL_BLOC_EXCEPTION);
    if (manualReason) {
      exceptions.push({ code: 'MANUAL_BLOC_EXCEPTION', file, reason: manualReason });
      continue;
    }
    if (!blocTestAvailable) {
      errors.push(issue('BLOC_TEST_DEPENDENCY', file, 'Bloc/Cubit transition tests require bloc_test under dev_dependencies. Run: flutter pub add --dev bloc_test'));
    }
    if (!/^\s*import\s+['"]package:bloc_test\/bloc_test\.dart['"];?/m.test(source)) {
      errors.push(issue('BLOC_TEST_IMPORT', file, 'Bloc/Cubit transition tests must import package:bloc_test/bloc_test.dart.'));
    }
    if (!typedBlocTest(source)) {
      errors.push(issue('BLOC_TEST_USAGE', file, 'Use blocTest<BlocType, StateType>(...) for Bloc/Cubit transitions, or document an approved manual exception.'));
    }
  }

  return { projectRoot: root, files: testFiles, errors, exceptions };
}

function parseArgs(argv) {
  const options = { projectRoot: process.cwd(), files: [], json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--project') {
      if (!argv[index + 1]) throw new Error('--project requires a directory.');
      options.projectRoot = argv[index += 1];
    } else if (value === '--file') {
      if (!argv[index + 1]) throw new Error('--file requires a project-relative test path.');
      options.files.push(argv[index += 1]);
    } else if (value === '--json') options.json = true;
    else if (value === '--help') options.help = true;
    else throw new Error(`Unknown option: ${value}`);
  }
  return options;
}

function formatResult(result) {
  if (!result.errors.length) {
    const summary = `Test policy validation passed (${result.files.length} changed test${result.files.length === 1 ? '' : 's'}).`;
    if (!result.exceptions.length) return summary;
    const exceptions = result.exceptions
      .map(({ code, file, reason }) => `[${code}] ${file}\n  Reason: ${reason}`)
      .join('\n\n');
    return `${summary}\n\nDocumented exceptions:\n\n${exceptions}`;
  }
  const failures = result.errors.map((error) => {
    const expected = error.expected ? `\n  Expected: ${error.expected}` : '';
    return `[${error.code}] ${error.file}\n  ${error.message}${expected}`;
  }).join('\n\n');
  return `Test policy validation failed:\n\n${failures}`;
}

export function run(argv = process.argv.slice(2), { log = console.log, error = console.error } = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    log('Usage: validate-test-policy.mjs [--project <dir>] [--file <test.dart> ...] [--json]');
    return 0;
  }
  const result = validateTestPolicy(options);
  const output = options.json ? JSON.stringify(result, null, 2) : formatResult(result);
  (result.errors.length ? error : log)(output);
  return result.errors.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    process.exitCode = run();
  } catch (reason) {
    console.error(`Test policy validation failed: ${reason.message}`);
    process.exitCode = 1;
  }
}
