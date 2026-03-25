declare namespace Express {
  interface Request {
    userId?: string;
    correlationId?: string;
  }
}
