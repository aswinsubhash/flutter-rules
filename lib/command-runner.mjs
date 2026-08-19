import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';

function quoteArgument(value) {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

export function resolveCommand(command, env = process.env) {
  const pathValue = env.PATH ?? env.Path ?? '';
  const candidates = process.platform === 'win32'
    ? [command, `${command}.cmd`, `${command}.exe`]
    : [command];
  const accessMode = process.platform === 'win32' ? constants.F_OK : constants.X_OK;

  const directories = isAbsolute(command) ? [''] : pathValue.split(delimiter);
  for (const directory of directories) {
    for (const candidate of candidates) {
      const executable = isAbsolute(candidate) ? candidate : join(directory, candidate);
      try {
        accessSync(executable, accessMode);
        return executable;
      } catch {
        // Continue looking through PATH and Windows executable variants.
      }
    }
  }
  return null;
}

export function commandExists(command, env = process.env) {
  return resolveCommand(command, env) !== null;
}

export function createCommandRunner({
  dryRun = false,
  env = process.env,
  cwd = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  return {
    dryRun,
    has(command) {
      return dryRun || commandExists(command, env);
    },
    run(command, args = [], { quiet = false } = {}) {
      const rendered = [command, ...args].map(quoteArgument).join(' ');
      if (dryRun) {
        stdout.write(`DRY RUN: ${rendered}\n`);
        return { code: 0, stdout: '', stderr: '', dryRun: true };
      }

      const executable = resolveCommand(command, env) ?? command;
      const result = spawnSync(executable, args, {
        cwd,
        env,
        encoding: 'utf8',
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const output = result.stdout ?? '';
      const errorOutput = result.stderr ?? '';
      if (!quiet && output) stdout.write(output);
      if (!quiet && errorOutput) stderr.write(errorOutput);

      if (result.error) {
        return {
          code: 1,
          stdout: output,
          stderr: `${errorOutput}${result.error.message}`,
          error: result.error,
        };
      }

      return {
        code: result.status ?? 1,
        stdout: output,
        stderr: errorOutput,
      };
    },
  };
}
