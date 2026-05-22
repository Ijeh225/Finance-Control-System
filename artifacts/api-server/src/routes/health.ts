import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getBackupStatus } from "../lib/backup";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * GET /health/backups
 * Returns the current database backup schedule status and recent backup history.
 * Useful for operational monitoring and alerting.
 */
router.get("/health/backups", (_req, res) => {
  const status = getBackupStatus();
  res.json(status);
});

export default router;
