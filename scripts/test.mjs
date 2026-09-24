import { getTestEnvironment, runBunScript } from './test-support.mjs';

let env;
try {
  env = getTestEnvironment();
} catch (error) {
  console.error(`[test] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const stages = [
  ['prepare the isolated E2E database', ['backend', 'test:db:setup']],
  ['run the complete backend Vitest suite', ['backend', 'test']],
  ['reseed the isolated database for browser tests', ['backend', 'test:seed']],
  ['run the frontend Playwright suite', ['frontend', 'test:e2e:run']]
];

for (const [description, [workspace, script]] of stages) {
  console.info(`\n[test] Starting: ${description}`);
  const exitCode = runBunScript(workspace, script, env);
  if (exitCode !== 0) {
    console.error(`[test] Stopped after failure: ${description}`);
    process.exit(exitCode);
  }
}

console.info('\n[test] Backend and Playwright suites passed.');
