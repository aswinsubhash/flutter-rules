import { accessSync, constants, statSync } from 'node:fs';
import { posix, win32 } from 'node:path';
import crossSpawn from 'cross-spawn';

function quoteArgument(value) {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function environmentValue(env, name, caseInsensitive) {
  if (!caseInsensitive) return env[name];
  const key = Object.keys(env).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? env[key] : undefined;
}

export function resolveCommand(command, env = process.env, platform = process.platform) {
  const windows = platform === 'win32';
  const path = windows ? win32 : posix;
  const pathValue = environmentValue(env, 'PATH', windows) ?? '';
  const pathExt = environmentValue(env, 'PATHEXT', windows) || '.COM;.EXE;.BAT;.CMD';
  const extensions = windows && !path.extname(command)
    ? ['', ...pathExt.split(';').filter(Boolean).map((value) => value.startsWith('.') ? value : `.${value}`)]
    : [''];
  const accessMode = windows ? constants.F_OK : constants.X_OK;
  const hasSeparator = command.includes(path.sep) || (windows && command.includes('/'));
  const directories = path.isAbsolute(command) || hasSeparator ? [''] : pathValue.split(path.delimiter);

  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = `${command}${extension}`;
      const executable = path.isAbsolute(candidate) ? candidate : path.join(directory, candidate);
      try {
        if (!statSync(executable).isFile()) continue;
        accessSync(executable, accessMode);
        return executable;
      } catch {
        // Continue looking through PATH and Windows executable variants.
      }
    }
  }
  return null;
}

export function commandExists(command, env = process.env, platform = process.platform) {
  return resolveCommand(command, env, platform) !== null;
}

export function createCommandRunner({
  dryRun = false,
  env = process.env,
  cwd = process.cwd(),
  platform = process.platform,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  return {
    dryRun,
    has(command) {
      return dryRun || commandExists(command, env, platform);
    },
    run(command, args = [], { quiet = false } = {}) {
      const rendered = [command, ...args].map(quoteArgument).join(' ');
      if (dryRun) {
        stdout.write(`DRY RUN: ${rendered}\n`);
        return { code: 0, stdout: '', stderr: '', dryRun: true };
      }

      const executable = resolveCommand(command, env, platform) ?? command;
      const result = crossSpawn.sync(executable, args, {
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
