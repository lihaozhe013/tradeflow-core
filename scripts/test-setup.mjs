import { getTestEnvironment, runPnpm } from './test-support.mjs';

let env;
try {
  env = getTestEnvironment();
} catch (error) {
  console.error(`[test] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

process.exitCode = runPnpm(['--dir', 'backend', 'test:db:setup'], env);
