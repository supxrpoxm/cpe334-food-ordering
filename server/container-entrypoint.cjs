const { spawn } = require('node:child_process');
const { once } = require('node:events');

const children = [
  {
    name: 'API',
    process: spawn(process.execPath, ['/app/server/dist/index.js'], {
      env: { ...process.env, PORT: process.env.API_PORT || '3001' },
      stdio: 'inherit',
    }),
  },
  {
    name: 'frontend',
    process: spawn(process.execPath, ['server.js'], {
      cwd: '/app/client',
      env: { ...process.env, HOSTNAME: '0.0.0.0' },
      stdio: 'inherit',
    }),
  },
];

let stopping = false;

function stop(exitCode) {
  if (stopping) return;
  stopping = true;

  for (const child of children) {
    child.process.kill('SIGTERM');
  }

  const timeout = setTimeout(() => {
    for (const child of children) {
      child.process.kill('SIGKILL');
    }
  }, 8000);
  timeout.unref();

  Promise.all(
    children.map(({ process: child }) =>
      child.exitCode !== null || child.signalCode !== null
        ? Promise.resolve()
        : once(child, 'close'),
    ),
  ).then(() => {
    clearTimeout(timeout);
    process.exitCode = exitCode;
  });
}

for (const child of children) {
  child.process.on('error', (error) => {
    console.error(`${child.name} process failed to start`, error);
    stop(1);
  });
  child.process.once('close', (code, signal) => {
    if (!stopping) {
      console.error(
        `${child.name} process exited unexpectedly (code=${code}, signal=${signal})`,
      );
      stop(code === 0 ? 1 : code || 1);
    }
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
