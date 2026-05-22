import rateLimit from "express-rate-limit";

/**
 * General API rate limiter — 100 requests per 15 minutes.
 * Applied to all authenticated API endpoints.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again in 15 minutes." },
  keyGenerator: (req) => {
    // Prefer authenticated user ID for per-user limiting; fall back to IP
    return req.session?.userId ?? req.ip ?? "unknown";
  },
});

/**
 * Auth rate limiter — 10 requests per 15 minutes.
 * Applied to login, logout, and password-change endpoints.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again in 15 minutes." },
  keyGenerator: (req) => req.ip ?? "unknown",
});

/**
 * Export rate limiter — 5 requests per 15 minutes.
 * Applied to all /export/* endpoints to prevent abuse of heavy report generation.
 */
export const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Export limit reached. Please wait 15 minutes before generating more reports." },
  keyGenerator: (req) => {
    return req.session?.userId ?? req.ip ?? "unknown";
  },
});
