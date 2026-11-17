const { spawn } = require('node:child_process');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const api = spawn(
  process.execPath,
  [path.join(__dirname, 'dist', 'index.js')],
  {
    env: { ...process.env, PORT: process.env.API_PORT || '3001' },
    stdio: 'inherit',
  },
);
const web = spawn(
  process.execPath,
  [path.join(appRoot, 'client', 'server.js')],
  {
    env: { ...process.env, PORT: process.env.PORT || '3000', HOSTNAME: '0.0.0.0' },
    stdio: 'inherit',
  },
);

const children = [api, web];
const closed = new Set();
let shuttingDown = false;
let exitCode = 0;
let killTimer;

function finishIfClosed() {
  if (shuttingDown && closed.size === children.length) {
    clearTimeout(killTimer);
    process.exitCode = exitCode;
  }
}

function shutdown(code) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  exitCode = code;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
  }
  killTimer = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  }, 10_000);
  killTimer.unref();
  finishIfClosed();
}

for (const child of children) {
  child.once('error', (error) => {
    console.error('Failed to start production service', error);
    shutdown(1);
  });
  child.once('close', (code) => {
    closed.add(child);
    if (!shuttingDown) {
      console.error(`Production service exited unexpectedly with code ${code}`);
      shutdown(code || 1);
    }
    finishIfClosed();
  });
}

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));
