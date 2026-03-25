import { Request } from 'express';

export interface GatewayRequest extends Request {
  userId?: string;
  correlationId: string;
}
