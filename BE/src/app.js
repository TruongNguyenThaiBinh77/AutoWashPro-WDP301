const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');

const swaggerSpec = require('./config/swagger');
const config = require('./config/env');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');
const { authRoutes, vehiclesRoutes, branchRoutes, packageRoutes, bookingRoutes, paymentRoutes, refundRequestRoutes, voucherRoutes, notificationRoutes, slotPackRoutes, reportRoutes, chatbotRoutes, sseRoutes, slotProductRoutes, giftRoutes, testimonialRoutes, statsRoutes, loyaltyRoutes, walletTransactionRoutes, configRoutes, policyRoutes, rewardRoutes } = require('./routes');

const extraOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const allowedOrigins = [config.APP_URL, config.API_URL, config.FE_URL, ...extraOrigins].filter(Boolean);

// M-5 SAFETY: trước đây cho phép `*.vercel.app` (suffix match) — bất kỳ Vercel
// deploy domain nào (kể cả attacker.Vercel.app) đều có thể gọi API. Giờ chỉ
// cho phép:
//   1. Origins trong whitelist (env)
//   2. Domain CHA (suffix *.vercel.app) — chỉ domain AutoWashPro của mình
//   3. localhost (chỉ dev)
const isDev = process.env.NODE_ENV !== 'production';
const ALLOWED_VERCEL_HOSTS = new Set([
  'autowashpro.vercel.app',
  'autowash-pro.vercel.app',
  'auto-wash-pro-wdp-301.vercel.app',
  'auto-wash-pro-wdp301.vercel.app',
]);

const { i18next, middleware: i18nMiddleware } = require('./config/i18n');

const app = express();
app.set('trust proxy', 1);

app.use(i18nMiddleware.handle(i18next));
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Same-origin / server-to-server (no Origin header): cho phép.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Vercel wildcard — chấp nhận domain trong ALLOWED_VERCEL_HOSTS hoặc domain của dự án
    const vercelMatch = origin.match(/^https?:\/\/([a-z0-9-]+)\.vercel\.app$/i);
    if (vercelMatch) {
      const parentHost = vercelMatch[1].toLowerCase();
      if (ALLOWED_VERCEL_HOSTS.has(`${parentHost}.vercel.app`) || 
          parentHost.startsWith('auto-wash') || 
          parentHost.startsWith('autowash')) {
        return callback(null, true);
      }
    }

    // Localhost & 127.0.0.1 — cho phép để FE local (localhost:5173) gọi được BE
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language']
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

app.use(
  '/api/',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10000, message: { success: false, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' } })
);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehiclesRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/refund-requests', refundRequestRoutes);
app.use('/api/vouchers', voucherRoutes);

app.use('/api/notifications', notificationRoutes);
app.use('/api/slot-packs', slotPackRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/chat', chatbotRoutes);
app.use('/api/sse', sseRoutes);
app.use('/api/slot-products', slotProductRoutes);
app.use('/api/gifts', giftRoutes);
app.use('/api/testimonials', testimonialRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/wallet-transactions', walletTransactionRoutes);
app.use('/api/configs', configRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/rewards', rewardRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
