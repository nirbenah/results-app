import { Request, Response, NextFunction } from 'express';
import { config } from '../../shared/config';
import { TooManyRequestsError } from '../../shared/errors';

interface BucketEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, BucketEntry>();

/** Evict expired entries periodically to prevent unbounded growth. */
const CLEANUP_INTERVAL_MS = 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) {
      buckets.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

function getKey(req: Request): string {
  return req.userId ?? req.ip ?? 'unknown';
}

export function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = getKey(req);
  const now = Date.now();
  const { windowMs, maxRequests } = config.rateLimit;

  let entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    buckets.set(key, entry);
  }

  entry.count += 1;

  const remaining = Math.max(0, maxRequests - entry.count);
  res.setHeader('X-RateLimit-Limit', maxRequests);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

  if (entry.count > maxRequests) {
    return next(new TooManyRequestsError());
  }

  next();
}
