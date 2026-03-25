import { Request, Response, NextFunction } from 'express';

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    const entry = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      userId: req.userId ?? null,
      correlationId: req.correlationId,
    };

    if (res.statusCode >= 500) {
      console.error('[request]', JSON.stringify(entry));
    } else {
      console.log('[request]', JSON.stringify(entry));
    }
  });

  next();
}
