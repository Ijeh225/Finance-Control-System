import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    // HTTP transport headers
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    // Never log passwords or secrets in any nested object
    "*.password",
    "*.passwordHash",
    "*.currentPassword",
    "*.newPassword",
    "*.secret",
    "*.token",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

// ─── Structured audit helpers ─────────────────────────────────────────────────
// These helpers emit structured log entries for sensitive operations so they
// appear in log aggregators (Datadog, Loki, etc.) with consistent fields.
// They intentionally NEVER log passwords or sensitive credential data.

export type AuditOperation =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.password_changed"
  | "auth.password_reset"
  | "data.create"
  | "data.update"
  | "data.delete"
  | "file.upload"
  | "file.download"
  | "export.generated";

interface AuditContext {
  userId?: string;
  userRole?: string;
  ip?: string;
  resource?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

/**
 * Log a sensitive operation with full audit context.
 * Never include passwords, tokens, or secrets in `details`.
 */
export function auditLog(operation: AuditOperation, ctx: AuditContext): void {
  logger.info(
    {
      audit: true,
      operation,
      userId: ctx.userId ?? "unauthenticated",
      userRole: ctx.userRole,
      ip: ctx.ip,
      resource: ctx.resource,
      resourceId: ctx.resourceId,
      timestamp: new Date().toISOString(),
      ...ctx.details,
    },
    `Audit: ${operation}`,
  );
}

