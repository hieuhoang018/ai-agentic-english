import { RequestHandler } from 'express';
import { decodeJwt } from 'jose';
import { UnauthorizedError } from '../errors/AppError';

/**
 * Canonical cross-service user reference. Always the Clerk user id (`sub`
 * claim of the Clerk-issued JWT).
 */
export type UserId = string;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: UserId };
    }
  }
}

const BEARER_PREFIX = 'Bearer ';

/**
 * Extracts the clerkUserId (`sub` claim) from a Kong-forwarded JWT.
 *
 * Kong validates the token's signature/expiry against the configured JWKS;
 * services only need to decode the already-validated claims, not re-verify
 * them.
 */
export function extractUserId(authorizationHeader: string | undefined): UserId {
  if (!authorizationHeader || !authorizationHeader.startsWith(BEARER_PREFIX)) {
    throw new UnauthorizedError('Missing bearer token');
  }

  const token = authorizationHeader.slice(BEARER_PREFIX.length).trim();

  let claims;
  try {
    claims = decodeJwt(token);
  } catch {
    throw new UnauthorizedError('Malformed token');
  }

  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new UnauthorizedError('Token missing sub claim');
  }

  return claims.sub;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  try {
    const userId = extractUserId(req.headers.authorization);
    req.auth = { userId };
    next();
  } catch (error) {
    next(error);
  }
};
