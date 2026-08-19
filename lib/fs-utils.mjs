import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

export function timestamp(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function installDirectory({
  source,
  destination,
  dryRun = false,
  now = new Date(),
}) {
  const resolvedSource = resolve(source);
  const resolvedDestination = resolve(destination);
  const baseBackup = `${resolvedDestination}.backup.${timestamp(now)}`;
  let backup = baseBackup;
  let suffix = 1;
  while (existsSync(backup)) {
    backup = `${baseBackup}.${suffix}`;
    suffix += 1;
  }

  if (dryRun) {
    return { destination: resolvedDestination, backup: existsSync(resolvedDestination) ? backup : null };
  }

  mkdirSync(dirname(resolvedDestination), { recursive: true });
  if (existsSync(resolvedDestination)) renameSync(resolvedDestination, backup);
  cpSync(resolvedSource, resolvedDestination, { recursive: true });
  return { destination: resolvedDestination, backup: existsSync(backup) ? backup : null };
}

export function removeDirectory({ destination, expectedSuffix, dryRun = false }) {
  const resolvedDestination = resolve(destination);
  const expected = isAbsolute(expectedSuffix) ? resolve(expectedSuffix) : expectedSuffix;
  const matches = isAbsolute(expectedSuffix)
    ? resolvedDestination === expected
    : resolvedDestination.endsWith(expected);
  if (!matches) {
    throw new Error(`Refusing to remove unexpected destination: ${resolvedDestination}`);
  }
  if (!dryRun) rmSync(resolvedDestination, { force: true, recursive: true });
  return resolvedDestination;
}

export function readText(path) {
  return readFileSync(path, 'utf8');
}

export function writeText(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
