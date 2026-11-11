import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { ApiError, validationError } from '../lib/errors';
import { asyncHandler, isPlainObject } from '../lib/http';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  clearAccessTokenCookie,
  setAccessTokenCookie,
} from '../lib/cookies';

const router = Router();

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  return secret;
}

function invalidCredentials(): ApiError {
  return new ApiError(
    401,
    'INVALID_CREDENTIALS',
    'Invalid email or password',
  );
}

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    const rawEmail = body.email;
    const rawPassword = body.password;

    if (typeof rawEmail !== 'string' || rawEmail.trim() === '') {
      throw validationError('email is required');
    }

    if (typeof rawPassword !== 'string' || rawPassword === '') {
      throw validationError('password is required');
    }

    const email = rawEmail.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw invalidCredentials();
    }

    const passwordMatches = await bcrypt.compare(
      rawPassword,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw invalidCredentials();
    }

    // Re-hash on successful login so the stored credential is always refreshed
    // with the current bcrypt cost and a fresh salt.
    const configuredRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);
    const saltRounds =
      Number.isInteger(configuredRounds) && configuredRounds > 0
        ? configuredRounds
        : 10;
    const refreshedPasswordHash = await bcrypt.hash(
      rawPassword,
      saltRounds,
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: refreshedPasswordHash },
    });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      getJwtSecret(),
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );

    setAccessTokenCookie(res, token);

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  }),
);

router.post('/logout', (_req, res) => {
  clearAccessTokenCookie(res);
  res.status(204).send();
});

export default router;
