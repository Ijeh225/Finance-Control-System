import { Router, type IRouter } from "express";
import multer from "multer";
import { eq, and } from "drizzle-orm";
import { db, billAttachmentsTable, billsTable, notificationsTable, usersTable } from "@workspace/db";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { Readable } from "stream";

const router: IRouter = Router();
const storageService = new ObjectStorageService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/octet-stream",
]);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/**
 * Fire "attachment uploaded" notifications:
 * - All MD users always receive a notification.
 * - If the uploader is not the bill creator, the bill creator also receives one.
 */
async function notifyAttachmentUploaded(
  billId: string,
  billDescription: string,
  billCreatedBy: string,
  uploaderId: string,
  fileName: string,
) {
  const title = "New Attachment";
  const body = `New attachment on ${billDescription}: ${fileName}`;

  // Notify every MD user
  const mdUsers = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "md"));

  const recipientIds = new Set<string>(mdUsers.map(u => u.id));

  // Also notify the bill creator if they are not the uploader
  if (billCreatedBy !== uploaderId) {
    recipientIds.add(billCreatedBy);
  }

  // Never notify the uploader (they already know about it)
  recipientIds.delete(uploaderId);

  for (const userId of recipientIds) {
    await db.insert(notificationsTable).values({
      id: uid(),
      userId,
      type: "attachment_uploaded",
      title,
      body,
      billId,
    });
  }
}

/**
 * POST /bills/:id/attachments
 * Multipart upload: receive the file, store it in object storage, and
 * record the attachment as confirmed in one step.
 */
router.post("/bills/:id/attachments", upload.single("file"), async (req, res): Promise<void> => {
  const actor = req.user!;
  const billId = req.params["id"] as string;
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: "No file provided. Send the file as multipart field 'file'." });
    return;
  }

  const mimeType = file.mimetype || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    res.status(400).json({ error: "File type not allowed. Permitted: PDF, images, Word, Excel, CSV." });
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

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: file.buffer,
    });
    if (!putRes.ok) {
      req.log.error({ status: putRes.status }, "Storage PUT failed during multipart upload");
      res.status(502).json({ error: "Failed to store file" });
      return;
    }

    const attachmentId = uid();
    await db.insert(billAttachmentsTable).values({
      id: attachmentId,
      billId,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType,
      storedKey: objectPath,
      confirmed: true,
      uploadedBy: actor.id,
      uploadedByName: actor.name,
    });

    await db.update(billsTable).set({ hasAttachment: true }).where(eq(billsTable.id, billId));

    await notifyAttachmentUploaded(billId, bill.description, bill.createdBy, actor.id, file.originalname);

    res.status(201).json({
      id: attachmentId,
      billId,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType,
      uploadedBy: actor.id,
      uploadedByName: actor.name,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to upload bill attachment (multipart)");
    res.status(500).json({ error: "Failed to upload attachment" });
  }
});

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

  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
    res.status(400).json({ error: "File type not allowed. Permitted: PDF, images, Word, Excel, CSV." });
    return;
  }

  if (fileSize && fileSize > MAX_FILE_SIZE) {
    res.status(400).json({ error: "File size exceeds the 20 MB limit." });
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

  const alreadyConfirmed = attachment.confirmed;

  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId));
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }

  await db.update(billAttachmentsTable)
    .set({ confirmed: true })
    .where(eq(billAttachmentsTable.id, attachmentId));

  await db.update(billsTable)
    .set({ hasAttachment: true })
    .where(eq(billsTable.id, billId));

  // Only notify on the first confirmation to prevent duplicate alerts
  if (!alreadyConfirmed) {
    await notifyAttachmentUploaded(billId, bill.description, bill.createdBy, actor.id, attachment.fileName);
  }

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
