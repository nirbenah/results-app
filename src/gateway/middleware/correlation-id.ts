import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

const HEADER = 'x-correlation-id';

export function correlationId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const existing = req.headers[HEADER];
  const id = typeof existing === 'string' && existing.length > 0 ? existing : uuidv4();

  req.correlationId = id;
  res.setHeader('X-Correlation-Id', id);
  next();
}
