import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role, User } from '@prisma/client';
import { JWT_SECRET } from './env';

export type AccessTokenPayload = {
  userId: string;
  role: Role | string;
};

export function signToken(
  payload: Record<string, unknown>,
  options: SignOptions = {},
): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '1h',
    ...options,
  });
}

export function signTokenWithSecret(
  payload: Record<string, unknown>,
  secret: string,
  options: SignOptions = {},
): string {
  return jwt.sign(payload, secret, {
    expiresIn: '1h',
    ...options,
  });
}

export function accessTokenFor(user: Pick<User, 'id' | 'role'>): string {
  return signToken({ userId: user.id, role: user.role });
}

export function expiredTokenFor(user: Pick<User, 'id' | 'role'>): string {
  return signToken(
    { userId: user.id, role: user.role },
    { expiresIn: -60 },
  );
}

export function wrongSecretTokenFor(
  user: Pick<User, 'id' | 'role'>,
): string {
  return jwt.sign(
    { userId: user.id, role: user.role },
    'a-different-secret-that-must-never-validate',
    { expiresIn: '1h' },
  );
}

export function cookieFor(token: string): string {
  return `access_token=${token}`;
}

export function authCookieFor(user: Pick<User, 'id' | 'role'>): string {
  return cookieFor(accessTokenFor(user));
}

export function corruptSignature(token: string): string {
  const parts = token.split('.');
  const signature = parts[2] ?? '';
  const replacement = signature.endsWith('a') ? 'b' : 'a';

  return `${parts[0]}.${parts[1]}.${signature.slice(0, -1)}${replacement}`;
}

export function tamperPayload(
  token: string,
  patch: Record<string, unknown>,
): string {
  const [header, payload, signature] = token.split('.');
  const decoded = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;

  const tampered = Buffer.from(
    JSON.stringify({ ...decoded, ...patch }),
  ).toString('base64url');

  return `${header}.${tampered}.${signature}`;
}

export function getSetCookies(
  response: { headers: Record<string, unknown> },
): string[] {
  const raw = response.headers['set-cookie'];

  if (!raw) {
    return [];
  }

  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

export function findSetCookie(
  response: { headers: Record<string, unknown> },
  name: string,
): string | undefined {
  return getSetCookies(response).find((cookie) =>
    cookie.startsWith(`${name}=`),
  );
}

export function cookieValue(
  response: { headers: Record<string, unknown> },
  name: string,
): string | undefined {
  const cookie = findSetCookie(response, name);

  if (!cookie) {
    return undefined;
  }

  const firstPart = cookie.split(';')[0];
  const separatorIndex = firstPart.indexOf('=');

  return separatorIndex === -1
    ? undefined
    : firstPart.slice(separatorIndex + 1);
}
