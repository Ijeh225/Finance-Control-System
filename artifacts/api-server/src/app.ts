import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./lib/seed";
import { DrizzleSessionStore } from "./lib/session-store";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

const app: Express = express();

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

app.use("/api", router);

seedIfEmpty().catch(err => logger.error({ err }, "Seed error"));

export default app;
