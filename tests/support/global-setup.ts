import { execSync } from 'node:child_process';
import './env';

export default function globalSetup() {
  const env = { ...process.env };

  execSync('npx prisma generate --schema server/prisma/schema.prisma', {
    stdio: 'inherit',
    env,
  });

  execSync(
    'npx prisma db push --schema server/prisma/schema.prisma --skip-generate --accept-data-loss',
    {
      stdio: 'inherit',
      env,
    },
  );
}
