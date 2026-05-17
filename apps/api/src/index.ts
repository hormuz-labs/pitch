import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { clerkMiddleware } from '@clerk/express';
import { pinoHttp, type Options as PinoHttpOptions } from 'pino-http';
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '@saas/shared';

import { router as webhookRoutes } from './routes/webhooks.js';
import { router as jobRoutes } from './routes/jobs.js';
import { router as creditRoutes } from './routes/credits.js';
import { router as userRoutes } from './routes/users.js';
import { router as checkoutRoutes } from './routes/checkout.js';
import { router as affiliateRoutes, redirectRouter } from './routes/affiliate.js';
import adminRoutes from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

dotenv.config({ path: path.join(rootDir, '.env') });

if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY;
}

const logger = createLogger('api');

export const app = express();

// Dodo webhook needs raw body — must come before express.json()
app.use('/webhooks', webhookRoutes);

app.use(express.json());
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());

app.use((req, res, next) => {
  if (req.path === '/jobs/stream' && req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
});

app.use(clerkMiddleware({ clockSkewInMs: 60_000 }));

app.use(pinoHttp({
  logger,
  autoLogging: {
    ignore: (req: IncomingMessage) => req.url === '/jobs/stream',
  },
  customLogLevel: (_req: IncomingMessage, res: ServerResponse) => {
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req(req: IncomingMessage) {
      return { method: (req as any).method, url: (req as any).url };
    },
    res(res: ServerResponse) {
      return { statusCode: res.statusCode };
    },
  },
} as PinoHttpOptions));

app.use('/demo', express.static(path.join(rootDir, 'demo')));

app.use('/jobs', jobRoutes);
app.use('/credits', creditRoutes);
app.use('/users', userRoutes);
app.use('/checkout', checkoutRoutes);
app.use(redirectRouter);
app.use('/affiliate', affiliateRoutes);
app.use('/admin', adminRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'API server started');
});
