import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import pinoHttp from "pino-http";
import { existsSync } from "node:fs";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./lib/seed";
import { DrizzleSessionStore } from "./lib/session-store";
import { generalLimiter, authLimiter, exportLimiter } from "./lib/rateLimiter";
import { errorHandler } from "./lib/errorHandler";
import { monitoringMiddleware, renderPrometheusMetrics } from "./lib/monitoring";
import { registerSwagger } from "./lib/swagger";
import { scheduleBackups } from "./lib/backup";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

// Email notifications are optional — warn once at startup if SMTP is not configured.
// The mailer module handles its own warning; this import ensures it runs at startup.
import("./lib/mailer.js").catch(err => logger.warn({ err }, "Mailer module failed to load"));

const app: Express = express();

// Trust the first proxy hop so express-session sets secure cookies correctly
// when running behind Replit's HTTPS reverse proxy.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Response-time and error-rate tracking — must come early so all routes are measured
app.use(monitoringMiddleware);

// Build an explicit origin allowlist from REPLIT_DOMAINS (comma-separated).
// Falls back to ALLOWED_ORIGINS for local/custom overrides.
// In development, also allow localhost on any port.
const _replitDomains = (process.env["REPLIT_DOMAINS"] ?? "")
  .split(",")
  .map(d => d.trim())
  .filter(Boolean)
  .map(d => `https://${d}`);
const _extraOrigins = (process.env["ALLOWED_ORIGINS"] ?? "")
  .split(",")
  .map(d => d.trim())
  .filter(Boolean);
const _allowedOrigins = new Set([..._replitDomains, ..._extraOrigins]);

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (server-to-server, curl, native mobile)
      if (!origin) return callback(null, true);
      if (process.env.NODE_ENV !== "production") {
        // Allow any localhost origin in development
        if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
      }
      if (_allowedOrigins.has(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new DrizzleSessionStore(),
    name: "fincommand.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Auth endpoints: 10 req / 15 min (brute-force protection)
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/logout", authLimiter);
app.use("/api/auth/change-password", authLimiter);

// Export endpoints: 5 req / 15 min (heavy report generation)
app.use("/api/export", exportLimiter);

// All other API endpoints: 100 req / 15 min
app.use("/api", generalLimiter);

// ─── Prometheus metrics (unauthenticated — restrict at infra level if needed) ─
app.get("/api/metrics", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(renderPrometheusMetrics());
});

// ─── API documentation (async — non-blocking) ─────────────────────────────────
// Registered BEFORE the authenticated router so /api/docs and /api/docs.json
// are public routes and not gated by requireAuth.
registerSwagger(app).catch(err => logger.warn({ err }, "Swagger registration failed"));

app.use("/api", router);

const webDistDir = path.resolve(__dirname, "../../web/dist/public");
const webIndexFile = path.join(webDistDir, "index.html");

if (existsSync(webIndexFile)) {
  app.use(express.static(webDistDir));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(webIndexFile);
  });
} else {
  logger.warn({ webDistDir }, "Web build not found; API-only mode enabled");
}

seedIfEmpty().catch(err => logger.error({ err }, "Seed error"));

// ─── Centralized error handler (must be last middleware) ──────────────────────
app.use(errorHandler);

// ─── Database backup scheduling ───────────────────────────────────────────────
scheduleBackups();

export default app;
