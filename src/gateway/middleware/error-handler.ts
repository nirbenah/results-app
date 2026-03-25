import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../shared/errors';
import { GatewayRequest } from '../types';

/**
 * Express error-handling middleware (4-arg signature).
 * Catches AppError instances and returns the standard error envelope.
 * Unknown errors become 500s.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const gatewayReq = req as GatewayRequest;
  const correlationId = gatewayReq.correlationId ?? 'unknown';

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        correlation_id: correlationId,
      },
    });
    return;
  }

  // Unexpected error — log full details, return generic message.
  console.error('[error-handler]', {
    message: err.message,
    stack: err.stack,
    correlationId,
    method: req.method,
    path: req.path,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      correlation_id: correlationId,
    },
  });
}
