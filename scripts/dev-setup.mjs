import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = path.join(rootDir, 'backend');
const configExampleDir = path.join(rootDir, 'config-example');
const configDir = path.join(rootDir, 'config');
const buildConfigDir = path.join(rootDir, 'build-config');
const flags = new Set(process.argv.slice(2));
const skipInstall = flags.has('--skip-install');
const skipBuild = flags.has('--skip-build');

if (flags.has('--help') || flags.has('-h')) {
  console.info(
    'Usage: bun run dev:setup [--skip-install] [--skip-build]\n' +
      '  --skip-install  Reuse the installed workspace dependencies.\n' +
      '  --skip-build    Skip the production frontend/backend build.'
  );
  process.exit(0);
}

function log(message) {
  console.info(`[dev:setup] ${message}`);
}

function run(command, args, options = {}) {
  log(`$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
    ...options
  });
  if (result.error) {
    throw new Error(`Failed to start ${command}: ${result.error.message}`, { cause: result.error });
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${String(result.status ?? 1)}.`);
  }
}

function isPortBusy(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (busy) => {
      socket.destroy();
      resolve(busy);
    };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

function provisionMcpToken() {
  log('Creating a local MCP bearer token...');
  const result = spawnSync(
    'bun',
    ['scripts/provisionDevMcp.ts', path.join(configDir, 'config.yaml')],
    {
      cwd: backendDir,
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit']
    }
  );
  if (result.error) {
    throw new Error(`Failed to start MCP provisioning: ${result.error.message}`, {
      cause: result.error
    });
  }
  if (result.status !== 0) {
    throw new Error(`MCP provisioning exited with code ${String(result.status ?? 1)}.`);
  }

  const token = result.stdout.trim().split(/\r?\n/).at(-1);
  if (!token?.startsWith('tfmcp_')) {
    throw new Error('MCP provisioning did not return a bearer token.');
  }
  return token;
}

async function main() {
  log('Resetting local configuration, cache, and the configured development database.');
  const busyPorts = [];
  for (const port of [8000, 5173]) {
    if (await isPortBusy(port)) busyPorts.push(port);
  }
  if (busyPorts.length > 0) {
    throw new Error(
      `Ports ${busyPorts.join(', ')} are already in use. Stop \`bun run dev\` before resetting.`
    );
  }

  if (!skipBuild) {
    const uvCheck = spawnSync('uv', ['--version'], { encoding: 'utf8' });
    if (uvCheck.error || uvCheck.status !== 0) {
      throw new Error(
        'uv is required for `bun run build`. Install uv or rerun with `--skip-build`.',
        { cause: uvCheck.error }
      );
    }
  }

  if (!skipInstall) {
    log('Installing workspace dependencies...');
    run('bun', ['install']);
  }

  const exampleConfigDir = path.join(configExampleDir, 'config');
  const exampleBuildConfigDir = path.join(configExampleDir, 'build-config');
  for (const directory of [exampleConfigDir, exampleBuildConfigDir]) {
    if (!existsSync(directory)) {
      throw new Error(`Required template directory is missing: ${directory}`);
    }
  }

  log('Resetting config, build-config, cache, and debug.log from the repository examples...');
  for (const directory of [
    configDir,
    buildConfigDir,
    path.join(rootDir, 'cache'),
    path.join(backendDir, 'cache')
  ]) {
    rmSync(directory, { recursive: true, force: true });
  }
  rmSync(path.join(rootDir, 'debug.log'), { force: true });
  cpSync(exampleConfigDir, configDir, { recursive: true });
  cpSync(exampleBuildConfigDir, buildConfigDir, { recursive: true });

  const mcpToken = provisionMcpToken();

  log('Recreating and seeding the development database...');
  run('bun', ['run', '--cwd', backendDir, 'db:recreate'], {
    env: { ...process.env, TRADEFLOW_CONFIG_DIR: configDir }
  });

  if (!skipBuild) {
    log('Building frontend and backend release assets...');
    run('bun', ['run', 'build']);
  }

  console.info('\n[dev:setup] Development environment is ready.');
  console.info(`[dev:setup] Config: ${path.relative(rootDir, configDir)}/config.yaml`);
  console.info('[dev:setup] Admin login: admin / admin123');
  console.info('[dev:setup] MCP endpoint: http://localhost:8000/mcp');
  console.info(`[dev:setup] MCP bearer token: ${mcpToken}`);
  console.info('[dev:setup] The token is shown once; rerun dev:setup to rotate it.');
  console.info('[dev:setup] Start with: bun run dev\n');
}

main().catch((error) => {
  console.error(`[dev:setup] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
