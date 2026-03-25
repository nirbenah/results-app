import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../shared/config';
import { UnauthorizedError } from '../../shared/errors';

interface JwtPayload {
  user_id: string;
}

/** Routes that skip JWT validation. */
const AUTH_PATH_PREFIX = '/v1/auth';

function isPublicRoute(path: string): boolean {
  return path.startsWith(AUTH_PATH_PREFIX);
}

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isPublicRoute(req.path)) {
    return next();
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  const token = header.slice(7);

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.userId = decoded.user_id;
    res.setHeader('X-User-Id', decoded.user_id);
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError('Token expired'));
    }
    return next(new UnauthorizedError('Invalid token'));
  }
}
