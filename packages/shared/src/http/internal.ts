import { RequestHandler } from 'express';

const INTERNAL_HEADER = 'x-internal-secret';

export function createInternalMiddleware(secret: string): RequestHandler {
  return (req, res, next) => {
    if (req.headers[INTERNAL_HEADER] !== secret) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Internal endpoint' } });
      return;
    }
    next();
  };
}
