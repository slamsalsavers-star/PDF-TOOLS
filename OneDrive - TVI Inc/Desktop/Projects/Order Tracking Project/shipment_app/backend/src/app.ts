import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';

import authRoutes        from './modules/auth/auth.routes.js';
import userRoutes        from './modules/users/users.routes.js';
import roleRoutes        from './modules/roles/roles.routes.js';
import shipmentRoutes    from './modules/shipments/shipments.routes.js';
import bookingRoutes     from './modules/bookings/bookings.routes.js';
import customerRoutes    from './modules/customers/customers.routes.js';
import forwarderRoutes   from './modules/forwarders/forwarders.routes.js';
import shippingLineRoutes from './modules/shipping-lines/shipping-lines.routes.js';
import periodRoutes      from './modules/periods/periods.routes.js';
import facilityRoutes    from './modules/facilities/facilities.routes.js';
import referenceRoutes   from './modules/reference/reference.routes.js';

const app = express();

// ─── Security & middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:      env.FRONTEND_URL,
  credentials: true,
}));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));

// ─── Routes ───────────────────────────────────────────────────────────────────
const v1 = '/api/v1';

app.use(`${v1}/auth`,          authRoutes);
app.use(`${v1}/users`,         userRoutes);
app.use(`${v1}/roles`,         roleRoutes);
app.use(`${v1}/shipments`,     shipmentRoutes);
app.use(`${v1}/bookings`,      bookingRoutes);
app.use(`${v1}/customers`,     customerRoutes);
app.use(`${v1}/forwarders`,    forwarderRoutes);
app.use(`${v1}/shipping-lines`,shippingLineRoutes);
app.use(`${v1}/periods`,       periodRoutes);
app.use(`${v1}/facilities`,    facilityRoutes);
app.use(`${v1}/reference`,     referenceRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ─── Error handler (must be last) ────────────────────────────────────────────
app.use(errorHandler);

export default app;
