import net from 'node:net';

const DEFAULT_TEST_DATABASE_URL =
  'postgresql://toktickit:toktickit@localhost:5433/toktickit?schema=test';

const databaseUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
const parsed = new URL(databaseUrl);
const host = parsed.hostname;
const port = Number(parsed.port || 5433);
const deadline = Date.now() + 60_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function canConnect() {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(2_000, () => finish(false));
  });
}

while (Date.now() < deadline) {
  if (await canConnect()) {
    console.log(`PostgreSQL is accepting connections on ${host}:${port}`);
    process.exit(0);
  }
  await sleep(1_000);
}

console.error(
  `Timed out waiting for PostgreSQL on ${host}:${port}. Run "docker compose up -d db" and retry.`,
);
process.exit(1);
