import request from 'supertest';
import type { Response } from 'supertest';
import app from '../../server/src/app';

export function api() {
  return request(app);
}

export function errorCode(response: Response): unknown {
  const body = response.body as {
    error?: { code?: unknown };
    success?: unknown;
  };

  return body?.error?.code;
}

export function expectNoOrderData(response: Response): void {
  const body = response.body as Record<string, unknown> | undefined;

  if (!body || typeof body !== 'object') {
    return;
  }

  if ('data' in body) {
    const data = body.data;

    if (Array.isArray(data)) {
      if (data.length !== 0) {
        throw new Error('Expected no order data, but received a non-empty array');
      }
    } else if (data !== null && data !== undefined) {
      throw new Error('Expected no order data, but received a data payload');
    }
  }
}
