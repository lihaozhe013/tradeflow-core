import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const debugLogPath = resolve(rootDir, 'debug.log');
const isWindows = process.platform === 'win32';
const bun = 'bun';
const services = [
  { name: 'backend', directory: 'backend' },
  { name: 'frontend', directory: 'frontend' }
];

const children = new Map();
let debugLogStream = null;
let logFailureReported = false;
let shuttingDown = false;
let shutdownPromise = null;
let exitCode = 0;

function timestamp() {
  return new Date().toISOString();
}

function reportLogFailure(error) {
  if (logFailureReported) {
    return;
  }

  logFailureReported = true;
  debugLogStream = null;
  console.error(
    `[dev] Unable to write ${debugLogPath}: ${error.message}. Continuing without file logging.`
  );
}

function openDebugLog() {
  try {
    debugLogStream = createWriteStream(debugLogPath, {
      encoding: 'utf8',
      flags: 'w'
    });
    debugLogStream.on('error', reportLogFailure);
  } catch (error) {
    reportLogFailure(error);
  }
}

function writeDebugLog(line) {
  if (!debugLogStream?.writable) {
    return;
  }

  try {
    debugLogStream.write(`${line}\n`);
  } catch (error) {
    reportLogFailure(error);
  }
}

function writeLine(service, channel, message, output) {
  const line = `${timestamp()} [${service}:${channel}] ${message}`;
  output.write(`${line}\n`);
  writeDebugLog(line);
}

function writeSystemLine(message, output = process.stdout) {
  writeLine('dev', 'system', message, output);
}

function attachOutput(serviceName, channel, stream, output) {
  const reader = createInterface({
    crlfDelay: Infinity,
    input: stream
  });

  reader.on('line', (line) => {
    writeLine(serviceName, channel, line, output);
  });
}

function isExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function terminateChild(child, signal = 'SIGTERM') {
  if (isExited(child)) {
    return;
  }

  try {
    if (isWindows) {
      // Bun may start child processes for package scripts, so terminate the
      // whole process tree to avoid orphaning the dev servers it started.
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore'
      });
      killer.on('error', (error) => {
        writeSystemLine(
          `Failed to stop child process ${child.pid}: ${error.message}`,
          process.stderr
        );
      });
      return;
    }

    child.kill(signal);
  } catch (error) {
    writeSystemLine(`Failed to stop child process ${child.pid}: ${error.message}`, process.stderr);
  }
}

async function closeDebugLog() {
  const stream = debugLogStream;
  debugLogStream = null;

  if (!stream) {
    return;
  }

  await new Promise((resolveStream) => {
    stream.once('error', resolveStream);
    stream.end(resolveStream);
  });
}

function shutdown(requestedExitCode = 0, terminationSignal = 'SIGTERM') {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shuttingDown = true;
  exitCode = Math.max(exitCode, requestedExitCode);
  writeSystemLine('Stopping development services.');

  for (const child of children.values()) {
    terminateChild(child, terminationSignal);
  }

  shutdownPromise = new Promise((resolveShutdown) => {
    const forceStopTimer = setTimeout(() => {
      for (const child of children.values()) {
        if (!isExited(child)) {
          child.kill('SIGKILL');
        }
      }
      resolveShutdown();
    }, 5000);

    const checkStopped = () => {
      if ([...children.values()].every(isExited)) {
        clearTimeout(forceStopTimer);
        resolveShutdown();
      }
    };

    for (const child of children.values()) {
      child.once('close', checkStopped);
    }

    checkStopped();
  }).then(async () => {
    await closeDebugLog();
    return exitCode;
  });

  return shutdownPromise;
}

function startService(service) {
  const options = {
    cwd: resolve(rootDir, service.directory),
    stdio: ['inherit', 'pipe', 'pipe']
  };

  const child = spawn(bun, ['run', 'dev'], options);

  children.set(service.name, child);
  attachOutput(service.name, 'stdout', child.stdout, process.stdout);
  attachOutput(service.name, 'stderr', child.stderr, process.stderr);

  child.on('error', (error) => {
    exitCode = 1;
    writeSystemLine(`${service.name} failed to start: ${error.message}`, process.stderr);
    void shutdown(exitCode);
  });

  child.on('close', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    exitCode = code ?? 1;
    writeSystemLine(
      `${service.name} exited with ${signal ? `signal ${signal}` : `code ${code}`}.`,
      exitCode === 0 ? process.stdout : process.stderr
    );
    void shutdown(exitCode);
  });
}

function handleSignal(signal) {
  if (shuttingDown) {
    return;
  }

  writeSystemLine(`Received ${signal}.`);
  const terminationSignal = signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM';
  void shutdown(0, terminationSignal).then((code) => {
    process.exitCode = code;
  });
}

openDebugLog();
writeSystemLine(`Starting development services. Logs: ${debugLogPath}`);

for (const service of services) {
  startService(service);
}

process.on('SIGINT', () => handleSignal('SIGINT'));
process.on('SIGTERM', () => handleSignal('SIGTERM'));
