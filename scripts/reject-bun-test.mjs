console.error(
  "[test] `bun test` starts Bun's native runner and bypasses this project's test setup. " +
    'Run `bun run test` from the repository root to execute the Vitest and Playwright suites.'
);
process.exit(1);
