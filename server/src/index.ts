import app from './app';

const port = Number(process.env.PORT) || 3001;
const server = app.listen(port, () => {
  console.log(`Food ordering API listening on port ${port}`);
});

function shutdown(signal: string): void {
  console.log(`${signal} received; closing HTTP server`);
  server.close((error) => {
    if (error) {
      console.error('Failed to close HTTP server cleanly', error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
