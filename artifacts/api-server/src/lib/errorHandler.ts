import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Centralized Express error-handling middleware.
 *
 * - Logs every error with user context (userId, endpoint, method, timestamp).
 * - Distinguishes client errors (4xx) from server errors (5xx).
 * - Never exposes stack traces in production.
 * - Returns a consistent { error, code } JSON envelope.
 *
 * Register this LAST in app.ts, after all routes:
 *   app.use(errorHandler);
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const status = getStatusCode(err);
  const isClientError = status >= 400 && status < 500;

  const context = {
    userId: req.session?.userId ?? req.user?.id ?? "unauthenticated",
    method: req.method,
    path: req.path,
    status,
    timestamp: new Date().toISOString(),
    ...(isClientError ? {} : { err }),
  };

  if (isClientError) {
    logger.warn(context, "Client error");
  } else {
    logger.error(context, "Unhandled server error");
  }

  const message = getErrorMessage(err, isClientError);

  res.status(status).json({
    error: message,
    ...(isProduction ? {} : { stack: err instanceof Error ? err.stack : undefined }),
  });
}

function getStatusCode(err: unknown): number {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e["status"] === "number") return e["status"];
    if (typeof e["statusCode"] === "number") return e["statusCode"];
  }
  return 500;
}

function getErrorMessage(err: unknown, isClientError: boolean): string {
  if (err instanceof Error) {
    // Always surface client-error messages; only surface server messages in dev
    if (isClientError || !isProduction) return err.message;
  }
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e["message"] === "string") {
      if (isClientError || !isProduction) return e["message"];
    }
  }
  return "An unexpected error occurred. Please try again later.";
}
