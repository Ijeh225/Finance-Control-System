import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "./logger";
import { objectStorageClient } from "./objectStorage";

const execAsync = promisify(exec);

interface BackupRecord {
  filename: string;
  startedAt: Date;
  completedAt?: Date;
  status: "running" | "success" | "failed";
  error?: string;
  sizeBytes?: number;
}

/** In-memory log of the last 10 backup attempts. */
const backupHistory: BackupRecord[] = [];

/**
 * Run a pg_dump of the configured DATABASE_URL and upload the result to
 * Google Cloud Storage under the configured backup bucket path.
 *
 * Retention: keeps the last 7 daily backups by deleting older files.
 */
export async function runBackup(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  const backupBucket = process.env["BACKUP_BUCKET"];
  const backupPrefix = process.env["BACKUP_PREFIX"] ?? "backups/fincommand";

  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set — skipping backup");
    return;
  }
  if (!backupBucket) {
    logger.warn("BACKUP_BUCKET not set — skipping backup. Set BACKUP_BUCKET to enable automated backups.");
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `${backupPrefix}-${timestamp}.sql.gz`;
  const record: BackupRecord = { filename, startedAt: new Date(), status: "running" };
  backupHistory.unshift(record);
  if (backupHistory.length > 10) backupHistory.pop();

  logger.info({ filename }, "Database backup started");

  try {
    // Dump and gzip in one pipeline; write to a temp file in /tmp
    const tmpPath = `/tmp/${filename.split("/").pop()}`;
    await execAsync(
      `pg_dump "${databaseUrl}" --no-password --format=plain | gzip > "${tmpPath}"`,
      { timeout: 10 * 60 * 1000 }, // 10-minute timeout
    );

    // Upload to GCS
    const bucket = objectStorageClient.bucket(backupBucket);
    await bucket.upload(tmpPath, { destination: filename });

    // Clean up temp file
    await execAsync(`rm -f "${tmpPath}"`);

    // Get file size for logging
    const [metadata] = await bucket.file(filename).getMetadata();
    const sizeBytes = Number(metadata.size ?? 0);

    record.status = "success";
    record.completedAt = new Date();
    record.sizeBytes = sizeBytes;

    logger.info({ filename, sizeBytes }, "Database backup completed successfully");

    // Rotate: delete backups older than 7 days
    await rotateBackups(bucket, backupPrefix);
  } catch (err) {
    record.status = "failed";
    record.completedAt = new Date();
    record.error = err instanceof Error ? err.message : String(err);
    logger.error({ err, filename }, "Database backup failed");
  }
}

async function rotateBackups(
  bucket: ReturnType<typeof objectStorageClient.bucket>,
  prefix: string,
): Promise<void> {
  try {
    const [files] = await bucket.getFiles({ prefix });
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const toDelete = files.filter((f) => {
      const created = f.metadata.timeCreated ? new Date(f.metadata.timeCreated as string) : null;
      return created && created < cutoff;
    });

    await Promise.all(toDelete.map((f) => f.delete()));

    if (toDelete.length > 0) {
      logger.info({ deleted: toDelete.length }, "Old backups rotated");
    }
  } catch (err) {
    logger.warn({ err }, "Backup rotation failed — old files may remain");
  }
}

/**
 * Schedule daily backups at 02:00 UTC.
 * Call this once at application startup.
 */
export function scheduleBackups(): void {
  const databaseUrl = process.env["DATABASE_URL"];
  const backupBucket = process.env["BACKUP_BUCKET"];

  if (!databaseUrl || !backupBucket) {
    logger.info("Backup scheduling skipped — DATABASE_URL or BACKUP_BUCKET not configured");
    return;
  }

  // Calculate milliseconds until next 02:00 UTC
  function msUntilNextRun(): number {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(2, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next.getTime() - now.getTime();
  }

  function scheduleNext() {
    const delay = msUntilNextRun();
    logger.info({ nextBackupIn: `${Math.round(delay / 60000)}m` }, "Next backup scheduled");
    setTimeout(() => {
      runBackup().catch((err) => logger.error({ err }, "Scheduled backup error"));
      // Re-schedule for the following day
      setInterval(() => {
        runBackup().catch((err) => logger.error({ err }, "Scheduled backup error"));
      }, 24 * 60 * 60 * 1000).unref();
    }, delay).unref();
  }

  scheduleNext();
}

/**
 * Return the current backup status for the health endpoint.
 */
export function getBackupStatus(): {
  scheduled: boolean;
  history: BackupRecord[];
  lastSuccess?: BackupRecord;
} {
  const scheduled = Boolean(process.env["DATABASE_URL"] && process.env["BACKUP_BUCKET"]);
  const lastSuccess = backupHistory.find((r) => r.status === "success");
  return { scheduled, history: backupHistory.slice(0, 5), lastSuccess };
}
