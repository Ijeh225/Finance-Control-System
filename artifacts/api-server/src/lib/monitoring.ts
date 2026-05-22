import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EndpointMetrics {
  count: number;
  errorCount: number;
  totalDurationMs: number;
  durations: number[]; // rolling window for percentile calculation
}

// ─── In-memory metrics store ──────────────────────────────────────────────────

const metrics = new Map<string, EndpointMetrics>();

/** Maximum number of duration samples kept per endpoint (for percentile calc). */
const MAX_SAMPLES = 1000;

function getOrCreate(key: string): EndpointMetrics {
  let m = metrics.get(key);
  if (!m) {
    m = { count: 0, errorCount: 0, totalDurationMs: 0, durations: [] };
    metrics.set(key, m);
  }
  return m;
}

function record(key: string, durationMs: number, isError: boolean): void {
  const m = getOrCreate(key);
  m.count++;
  m.totalDurationMs += durationMs;
  if (isError) m.errorCount++;

  m.durations.push(durationMs);
  if (m.durations.length > MAX_SAMPLES) m.durations.shift();
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Express middleware that records response time and error rate per endpoint.
 * Attach this early in the middleware chain (after pinoHttp) in app.ts.
 */
export function monitoringMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    // Normalise path params to avoid cardinality explosion:
    //   /bills/abc123 → /bills/:id
    const normPath = req.path
      .replace(/\/[0-9a-f]{8,}/gi, "/:id")
      .replace(/\/\d+/g, "/:id");
    const key = `${req.method} ${normPath}`;
    const isError = res.statusCode >= 500;

    record(key, durationMs, isError);

    // Alert thresholds
    const m = getOrCreate(key);
    const errorRate = m.count > 0 ? m.errorCount / m.count : 0;
    const sorted = [...m.durations].sort((a, b) => a - b);
    const p95 = percentile(sorted, 95);

    if (errorRate > 0.05 && m.count >= 20) {
      logger.warn(
        { endpoint: key, errorRate: (errorRate * 100).toFixed(1) + "%", count: m.count },
        "ALERT: Error rate exceeds 5%",
      );
    }
    if (p95 > 1000 && m.count >= 20) {
      logger.warn(
        { endpoint: key, p95Ms: p95, count: m.count },
        "ALERT: p95 response time exceeds 1000ms",
      );
    }
  });

  next();
}

// ─── Prometheus export ────────────────────────────────────────────────────────

/**
 * Render all collected metrics in Prometheus text exposition format.
 * Served at GET /api/metrics.
 */
export function renderPrometheusMetrics(): string {
  const lines: string[] = [];

  lines.push("# HELP fincommand_http_requests_total Total HTTP requests per endpoint");
  lines.push("# TYPE fincommand_http_requests_total counter");

  lines.push("# HELP fincommand_http_errors_total Total HTTP 5xx errors per endpoint");
  lines.push("# TYPE fincommand_http_errors_total counter");

  lines.push("# HELP fincommand_http_duration_p50_ms p50 response time in milliseconds");
  lines.push("# TYPE fincommand_http_duration_p50_ms gauge");

  lines.push("# HELP fincommand_http_duration_p95_ms p95 response time in milliseconds");
  lines.push("# TYPE fincommand_http_duration_p95_ms gauge");

  lines.push("# HELP fincommand_http_duration_p99_ms p99 response time in milliseconds");
  lines.push("# TYPE fincommand_http_duration_p99_ms gauge");

  for (const [endpoint, m] of metrics.entries()) {
    const label = `endpoint="${endpoint.replace(/"/g, '\\"')}"`;
    const sorted = [...m.durations].sort((a, b) => a - b);

    lines.push(`fincommand_http_requests_total{${label}} ${m.count}`);
    lines.push(`fincommand_http_errors_total{${label}} ${m.errorCount}`);
    lines.push(`fincommand_http_duration_p50_ms{${label}} ${percentile(sorted, 50).toFixed(2)}`);
    lines.push(`fincommand_http_duration_p95_ms{${label}} ${percentile(sorted, 95).toFixed(2)}`);
    lines.push(`fincommand_http_duration_p99_ms{${label}} ${percentile(sorted, 99).toFixed(2)}`);
  }

  return lines.join("\n") + "\n";
}
