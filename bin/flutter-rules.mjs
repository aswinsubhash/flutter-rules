#!/usr/bin/env node

import { runCli } from '../lib/cli.mjs';

try {
  process.exitCode = await runCli(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
