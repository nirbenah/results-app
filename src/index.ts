import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './shared/config';
import { getDb } from './shared/db';
import {
  correlationId,
  requestLogger,
  rateLimiter,
  authenticate,
  errorHandler,
} from './gateway';

// ─── Module imports ───
import { router as authRouter } from './modules/auth';
import { router as groupsRouter, register as registerGroups } from './modules/groups';
import { router as betsRouter, register as registerBets } from './modules/bets';
import { router as walletRouter, registerSubscribers as registerWallet } from './modules/wallet';
import { register as registerNotify } from './modules/notify';

const app = express();

// ─── Global middleware (order matters — matches gateway lifecycle) ───
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(cors());
app.use(express.json());
app.use(correlationId);
app.use(requestLogger);
app.use(rateLimiter);

// ─── Health check (before auth — no token needed) ───
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Serve UI (before auth — no token needed) ───
app.get('/ui', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'ui.html'));
});

// ─── Auth middleware (everything below requires a token) ───
app.use(authenticate);

// ─── Mount v1 routes ───
app.use('/v1', authRouter);
app.use('/v1/groups', groupsRouter);
app.use('/v1', betsRouter);
app.use('/v1', walletRouter);

// ─── Error handler (must be last) ───
app.use(errorHandler);

// ─── Bootstrap ───
async function bootstrap(): Promise<void> {
  // Verify DB connection
  const db = getDb();
  await db.raw('SELECT 1');
  console.log('[DB] Connected to PostgreSQL');

  // Register event subscribers for each module
  registerGroups();
  registerBets();
  registerWallet();
  registerNotify();
  console.log('[Events] All module subscribers registered');

  // Start server
  app.listen(config.port, () => {
    console.log(`[Server] Running on port ${config.port} (${config.nodeEnv})`);
    console.log(`[Server] API base: http://localhost:${config.port}/v1`);
  });
}

bootstrap().catch((err) => {
  console.error('[Fatal] Failed to start:', err);
  process.exit(1);
});

export default app;
