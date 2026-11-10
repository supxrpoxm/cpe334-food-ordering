import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import express from 'express';
import { ApiError } from './lib/errors';
import adminOrderRoutes from './routes/adminOrderRoutes';
import authRoutes from './routes/authRoutes';
import orderRoutes from './routes/orderRoutes';
import productRoutes from './routes/productRoutes';

const app = express();

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());

app.get('/', (_req, res) =>
  res.json({ status: 'ok', message: 'Backend is running' }),
);

app.use('/api/auth', authRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/v1/admin/orders', adminOrderRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `No route implemented for ${req.method} ${req.originalUrl}`,
    },
  });
});

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    if (error instanceof ApiError) {
      res.status(error.status).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined
            ? {}
            : { details: error.details }),
        },
      });
      return;
    }

    if (error instanceof SyntaxError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Malformed JSON request body',
        },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    });
  },
);

export default app;
