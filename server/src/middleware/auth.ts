import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Role } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { ApiError } from '../lib/errors';
import { readCookie, ACCESS_TOKEN_COOKIE } from '../lib/cookies';
import { isPlainObject } from '../lib/http';

export type AuthUser = {
  userId: string;
  role: Role;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  return secret;
}

function unauthorized(): ApiError {
  return new ApiError(401, 'UNAUTHORIZED', 'Authentication is required');
}

export const authenticate: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const token = readCookie(req, ACCESS_TOKEN_COOKIE);

  if (!token) {
    next(unauthorized());
    return;
  }

  let decoded: unknown;

  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch {
    next(unauthorized());
    return;
  }

  if (!isPlainObject(decoded)) {
    next(unauthorized());
    return;
  }

  const userId = decoded.userId;
  const role = decoded.role;

  if (typeof userId !== 'string' || userId.trim() === '') {
    next(unauthorized());
    return;
  }

  if (role !== Role.CUSTOMER && role !== Role.ADMIN) {
    next(unauthorized());
    return;
  }

  req.user = { userId, role };
  next();
};

export function authorize(...allowedRoles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      next(unauthorized());
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      next(
        new ApiError(
          403,
          'FORBIDDEN_ROLE',
          'You do not have permission to perform this action',
        ),
      );
      return;
    }

    next();
  };
}
