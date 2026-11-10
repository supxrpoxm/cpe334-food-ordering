import express from 'express';

const app = express();

app.use(express.json());

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: `No route implemented for ${req.method} ${req.originalUrl}`,
    },
  });
});

export default app;
