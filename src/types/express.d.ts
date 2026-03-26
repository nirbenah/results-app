declare namespace Express {
  interface Request {
    userId?: string;
    realUserId?: string; // original admin userId during impersonation
    correlationId?: string;
  }
}
