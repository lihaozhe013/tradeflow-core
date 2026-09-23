import { getTestEnvironment, runPnpm } from './test-support.mjs';

let env;
try {
  env = getTestEnvironment();
} catch (error) {
  console.error(`[test:e2e] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const stages = [
  ['prepare the isolated E2E database', ['--dir', 'backend', 'test:db:setup']],
  ['seed the isolated database', ['--dir', 'backend', 'test:seed']],
  ['run the frontend Playwright suite', ['--dir', 'frontend', 'test:e2e:run']]
];

for (const [description, args] of stages) {
  console.info(`\n[test:e2e] Starting: ${description}`);
  const exitCode = runPnpm(args, env);
  if (exitCode !== 0) {
    console.error(`[test:e2e] Stopped after failure: ${description}`);
    process.exit(exitCode);
  }
}

console.info('\n[test:e2e] Playwright suite passed.');
