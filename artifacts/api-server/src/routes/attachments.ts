import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, billAttachmentsTable, billsTable } from "@workspace/db";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { Readable } from "stream";

const router: IRouter = Router();
const storageService = new ObjectStorageService();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/**
 * POST /bills/:id/attachments/request-upload
 * Request a presigned URL to upload a file attachment for a bill.
 * Returns { attachmentId, uploadUrl, objectPath }.
 */
router.post("/bills/:id/attachments/request-upload", async (req, res): Promise<void> => {
  const actor = req.user!;
  const billId = req.params["id"];
  const { fileName, fileSize, mimeType } = req.body as {
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
  };

  if (!fileName) {
    res.status(400).json({ error: "fileName is required" });
    return;
  }

  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId));
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }
  if (actor.role !== "md" && bill.createdBy !== actor.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const uploadUrl = await storageService.getObjectEntityUploadURL();
    const objectPath = storageService.normalizeObjectEntityPath(uploadUrl);

    const attachmentId = uid();
    await db.insert(billAttachmentsTable).values({
      id: attachmentId,
      billId,
      fileName,
      fileSize: fileSize ?? null,
      mimeType: mimeType ?? null,
      storedKey: objectPath,
      confirmed: false,
      uploadedBy: actor.id,
      uploadedByName: actor.name,
    });

    res.json({ attachmentId, uploadUrl, objectPath });
  } catch (err) {
    req.log.error({ err }, "Failed to create upload URL for bill attachment");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * POST /bills/:id/attachments/:attachmentId/confirm
 * Confirm that the file was successfully uploaded to GCS.
 * Marks the attachment as confirmed and updates bill.hasAttachment.
 */
router.post("/bills/:id/attachments/:attachmentId/confirm", async (req, res): Promise<void> => {
  const actor = req.user!;
  const billId = req.params["id"];
  const attachmentId = req.params["attachmentId"];

  const [attachment] = await db.select().from(billAttachmentsTable).where(
    and(eq(billAttachmentsTable.id, attachmentId), eq(billAttachmentsTable.billId, billId))
  );
  if (!attachment) {
    res.status(404).json({ error: "Attachment not found" });
    return;
  }
  if (attachment.uploadedBy !== actor.id && actor.role !== "md") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.update(billAttachmentsTable)
    .set({ confirmed: true })
    .where(eq(billAttachmentsTable.id, attachmentId));

  await db.update(billsTable)
    .set({ hasAttachment: true })
    .where(eq(billsTable.id, billId));

  res.json({ ok: true });
});

/**
 * GET /bills/:id/attachments
 * List confirmed attachments for a bill.
 */
router.get("/bills/:id/attachments", async (req, res): Promise<void> => {
  const actor = req.user!;
  const billId = req.params["id"];

  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId));
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }
  if (actor.role !== "md" && bill.createdBy !== actor.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const attachments = await db.select()
    .from(billAttachmentsTable)
    .where(and(eq(billAttachmentsTable.billId, billId), eq(billAttachmentsTable.confirmed, true)));

  res.json({
    attachments: attachments.map(a => ({
      id: a.id,
      billId: a.billId,
      fileName: a.fileName,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
      uploadedBy: a.uploadedBy,
      uploadedByName: a.uploadedByName,
      uploadedAt: a.uploadedAt,
    })),
  });
});

/**
 * DELETE /attachments/:attachmentId
 * Delete a bill attachment. Only the uploader or MD may delete.
 */
router.delete("/attachments/:attachmentId", async (req, res): Promise<void> => {
  const actor = req.user!;
  const attachmentId = req.params["attachmentId"];

  const [attachment] = await db.select()
    .from(billAttachmentsTable)
    .where(eq(billAttachmentsTable.id, attachmentId));
  if (!attachment) {
    res.status(404).json({ error: "Attachment not found" });
    return;
  }
  if (attachment.uploadedBy !== actor.id && actor.role !== "md") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(billAttachmentsTable).where(eq(billAttachmentsTable.id, attachmentId));

  const remaining = await db.select()
    .from(billAttachmentsTable)
    .where(and(eq(billAttachmentsTable.billId, attachment.billId), eq(billAttachmentsTable.confirmed, true)));
  if (remaining.length === 0) {
    await db.update(billsTable).set({ hasAttachment: false }).where(eq(billsTable.id, attachment.billId));
  }

  res.json({ ok: true });
});

/**
 * GET /attachments/:attachmentId/download
 * Stream a bill attachment file to the client.
 */
router.get("/attachments/:attachmentId/download", async (req, res): Promise<void> => {
  const actor = req.user!;
  const attachmentId = req.params["attachmentId"];

  const [attachment] = await db.select()
    .from(billAttachmentsTable)
    .where(eq(billAttachmentsTable.id, attachmentId));
  if (!attachment) {
    res.status(404).json({ error: "Attachment not found" });
    return;
  }

  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, attachment.billId));
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }
  if (actor.role !== "md" && bill.createdBy !== actor.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (!attachment.storedKey) {
    res.status(404).json({ error: "File not available" });
    return;
  }

  try {
    const file = await storageService.getObjectEntityFile(attachment.storedKey);
    const fileResponse = await storageService.downloadObject(file, 0);

    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(attachment.fileName)}"`);
    if (attachment.mimeType) {
      res.setHeader("Content-Type", attachment.mimeType);
    }
    if (attachment.fileSize) {
      res.setHeader("Content-Length", attachment.fileSize);
    }

    if (fileResponse.body) {
      const readable = Readable.fromWeb(fileResponse.body as Parameters<typeof Readable.fromWeb>[0]);
      readable.pipe(res);
    } else {
      res.status(500).json({ error: "File body unavailable" });
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found in storage" });
    } else {
      req.log.error({ err }, "Failed to download attachment");
      res.status(500).json({ error: "Failed to download file" });
    }
  }
});

export default router;
