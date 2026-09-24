import { getTestEnvironment, runBunScript } from './test-support.mjs';

let env;
try {
  env = getTestEnvironment();
} catch (error) {
  console.error(`[test:e2e] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const stages = [
  ['prepare the isolated E2E database', ['backend', 'test:db:setup']],
  ['seed the isolated database', ['backend', 'test:seed']],
  ['run the frontend Playwright suite', ['frontend', 'test:e2e:run']]
];

for (const [description, [workspace, script]] of stages) {
  console.info(`\n[test:e2e] Starting: ${description}`);
  const exitCode = runBunScript(workspace, script, env);
  if (exitCode !== 0) {
    console.error(`[test:e2e] Stopped after failure: ${description}`);
    process.exit(exitCode);
  }
}

console.info('\n[test:e2e] Playwright suite passed.');
