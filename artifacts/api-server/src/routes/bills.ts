import { Router, type IRouter } from "express";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, billsTable, commentsTable, auditTable, vendorsTable, notificationsTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function formatBill(b: Record<string, unknown>) {
  return {
    ...b,
    amount: parseFloat(String(b["amount"] ?? 0)),
    approvedAmount: b["approvedAmount"] != null ? parseFloat(String(b["approvedAmount"])) : undefined,
    paidAmount: parseFloat(String(b["paidAmount"] ?? 0)),
    outstandingBalance: parseFloat(String(b["outstandingBalance"] ?? 0)),
  };
}

async function addAudit(billId: string, userId: string, userName: string, action: string, details?: string, oldValue?: string, newValue?: string) {
  await db.insert(auditTable).values({ id: uid(), billId, userId, userName, action, details, oldValue, newValue });
}

async function notify(userId: string, type: string, title: string, body: string, billId?: string) {
  await db.insert(notificationsTable).values({
    id: uid(), userId, type: type as "bill_approved", title, body, billId: billId ?? null
  });
}

router.get("/bills", async (req, res): Promise<void> => {
  const { status, userId, vendorId, priority, from, to } = req.query as Record<string, string>;
  const conditions: ReturnType<typeof eq>[] = [];
  if (status) conditions.push(eq(billsTable.status, status as "pending"));
  if (userId) conditions.push(eq(billsTable.createdBy, userId));
  if (vendorId) conditions.push(eq(billsTable.vendorId, vendorId));
  if (priority) conditions.push(eq(billsTable.priority, priority as "low"));
  if (from) conditions.push(gte(billsTable.scheduledDate, from));
  if (to) conditions.push(lte(billsTable.scheduledDate, to));
  const bills = await db.select().from(billsTable).where(conditions.length ? and(...conditions) : undefined);
  const total = bills.reduce((a, b) => a + parseFloat(String(b.amount)), 0);
  res.json({ bills: bills.map(b => formatBill(b as Record<string, unknown>)), total });
});

router.post("/bills", async (req, res): Promise<void> => {
  const actor = req.user!;
  const { vendorId, description, amount, scheduledDate, dueDate, walletId, priority, hasAttachment } = req.body;
  if (!vendorId || !description || !amount || !scheduledDate) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  const vendorName = vendor?.name ?? "Unknown Vendor";
  const amountStr = String(amount);

  const [bill] = await db.insert(billsTable).values({
    id: uid(), vendorId, vendorName, description, amount: amountStr,
    paidAmount: "0", outstandingBalance: amountStr,
    scheduledDate, dueDate, walletId, priority: priority ?? "medium",
    status: "pending", createdBy: actor.id, createdByName: actor.name,
    hasAttachment: Boolean(hasAttachment), overdueDays: 0,
  }).returning();

  await db.update(vendorsTable).set({
    outstandingBalance: sql`${vendorsTable.outstandingBalance} + ${amountStr}`,
    totalBilled: sql`${vendorsTable.totalBilled} + ${amountStr}`,
  }).where(eq(vendorsTable.id, vendorId));

  await addAudit(bill!.id, actor.id, actor.name, "created", `Bill created for ${vendorName}`);
  res.status(201).json(formatBill(bill as unknown as Record<string, unknown>));
});

router.get("/bills/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, rawId!));
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  const [comments, auditEntries, vendor] = await Promise.all([
    db.select().from(commentsTable).where(eq(commentsTable.billId, rawId!)),
    db.select().from(auditTable).where(eq(auditTable.billId, rawId!)),
    db.select().from(vendorsTable).where(eq(vendorsTable.id, bill.vendorId)),
  ]);
  const v = vendor[0];
  res.json({
    ...formatBill(bill as unknown as Record<string, unknown>),
    comments,
    auditTrail: auditEntries,
    vendor: v ? {
      ...v,
      totalBilled: parseFloat(String(v.totalBilled ?? 0)),
      totalPaid: parseFloat(String(v.totalPaid ?? 0)),
      outstandingBalance: parseFloat(String(v.outstandingBalance ?? 0)),
    } : undefined,
  });
});

router.patch("/bills/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { description, amount, scheduledDate, dueDate, walletId, priority } = req.body;
  const updates: Record<string, unknown> = {};
  if (description) updates["description"] = description;
  if (amount !== undefined) { updates["amount"] = String(amount); updates["outstandingBalance"] = String(amount); }
  if (scheduledDate) updates["scheduledDate"] = scheduledDate;
  if (dueDate) updates["dueDate"] = dueDate;
  if (walletId) updates["walletId"] = walletId;
  if (priority) updates["priority"] = priority;
  const [bill] = await db.update(billsTable).set(updates).where(eq(billsTable.id, rawId!)).returning();
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  res.json(formatBill(bill as unknown as Record<string, unknown>));
});

router.post("/bills/:id/approve", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { comment, approvedAmount } = req.body ?? {};
  const [existing] = await db.select().from(billsTable).where(eq(billsTable.id, rawId!));
  if (!existing) { res.status(404).json({ error: "Bill not found" }); return; }
  const [bill] = await db.update(billsTable).set({ status: "approved", approvedAmount: approvedAmount ? String(approvedAmount) : String(existing.amount) }).where(eq(billsTable.id, rawId!)).returning();
  await addAudit(rawId!, actor.id, actor.name, "approved", comment ?? "Bill approved");
  if (comment) await db.insert(commentsTable).values({ id: uid(), billId: rawId!, authorId: actor.id, authorName: actor.name, authorRole: actor.role, text: comment });
  await notify(existing.createdBy, "bill_approved", "Bill Approved", `Your bill for ${existing.vendorName} has been approved.`, rawId!);
  res.json(formatBill(bill as unknown as Record<string, unknown>));
});

router.post("/bills/:id/reject", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { comment } = req.body ?? {};
  const [existing] = await db.select().from(billsTable).where(eq(billsTable.id, rawId!));
  if (!existing) { res.status(404).json({ error: "Bill not found" }); return; }
  const [bill] = await db.update(billsTable).set({ status: "rejected" }).where(eq(billsTable.id, rawId!)).returning();
  await addAudit(rawId!, actor.id, actor.name, "rejected", comment ?? "Bill rejected");
  if (comment) await db.insert(commentsTable).values({ id: uid(), billId: rawId!, authorId: actor.id, authorName: actor.name, authorRole: actor.role, text: comment });
  await notify(existing.createdBy, "bill_rejected", "Bill Rejected", `Your bill for ${existing.vendorName} has been rejected.`, rawId!);
  res.json(formatBill(bill as unknown as Record<string, unknown>));
});

router.post("/bills/:id/hold", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { comment, rescheduleDate } = req.body ?? {};
  const [existing] = await db.select().from(billsTable).where(eq(billsTable.id, rawId!));
  if (!existing) { res.status(404).json({ error: "Bill not found" }); return; }
  const updates: Record<string, unknown> = { status: "on_hold" };
  if (rescheduleDate) updates["scheduledDate"] = rescheduleDate;
  const [bill] = await db.update(billsTable).set(updates).where(eq(billsTable.id, rawId!)).returning();
  await addAudit(rawId!, actor.id, actor.name, "held", comment ?? "Bill placed on hold");
  if (comment) await db.insert(commentsTable).values({ id: uid(), billId: rawId!, authorId: actor.id, authorName: actor.name, authorRole: actor.role, text: comment });
  await notify(existing.createdBy, "bill_held", "Bill On Hold", `Your bill for ${existing.vendorName} has been placed on hold.`, rawId!);
  res.json(formatBill(bill as unknown as Record<string, unknown>));
});

router.post("/bills/:id/partial-approve", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { approvedAmount, comment } = req.body ?? {};
  if (!approvedAmount) { res.status(400).json({ error: "approvedAmount is required" }); return; }
  const [existing] = await db.select().from(billsTable).where(eq(billsTable.id, rawId!));
  if (!existing) { res.status(404).json({ error: "Bill not found" }); return; }
  const outstanding = parseFloat(String(existing.amount)) - approvedAmount;
  const [bill] = await db.update(billsTable).set({ status: "partial", approvedAmount: String(approvedAmount), outstandingBalance: String(outstanding) }).where(eq(billsTable.id, rawId!)).returning();
  await addAudit(rawId!, actor.id, actor.name, "partial_approved", comment ?? `Partial payment approved: ${approvedAmount}`, String(existing.amount), String(approvedAmount));
  if (comment) await db.insert(commentsTable).values({ id: uid(), billId: rawId!, authorId: actor.id, authorName: actor.name, authorRole: actor.role, text: comment });
  await notify(existing.createdBy, "bill_partial", "Partial Approval", `Your bill for ${existing.vendorName} has been partially approved.`, rawId!);
  res.json(formatBill(bill as unknown as Record<string, unknown>));
});

router.post("/bills/:id/escalate", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { comment } = req.body ?? {};
  const [existing] = await db.select().from(billsTable).where(eq(billsTable.id, rawId!));
  if (!existing) { res.status(404).json({ error: "Bill not found" }); return; }
  const [bill] = await db.update(billsTable).set({ priority: "urgent" }).where(eq(billsTable.id, rawId!)).returning();
  await addAudit(rawId!, actor.id, actor.name, "escalated", comment ?? "Bill escalated to urgent");
  if (comment) await db.insert(commentsTable).values({ id: uid(), billId: rawId!, authorId: actor.id, authorName: actor.name, authorRole: actor.role, text: comment });
  res.json(formatBill(bill as unknown as Record<string, unknown>));
});

router.get("/bills/:id/comments", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const comments = await db.select().from(commentsTable).where(eq(commentsTable.billId, rawId!));
  res.json({ comments });
});

router.post("/bills/:id/comments", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { text } = req.body;
  if (!text) { res.status(400).json({ error: "text is required" }); return; }
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, rawId!));
  const [comment] = await db.insert(commentsTable).values({
    id: uid(), billId: rawId!, authorId: actor.id,
    authorName: actor.name,
    authorRole: actor.role,
    text,
  }).returning();
  await addAudit(rawId!, actor.id, actor.name, "commented", text);
  if (bill && bill.createdBy !== actor.id) {
    await notify(bill.createdBy, "comment_added", "New Comment", `${actor.name} commented on your bill: "${text.slice(0, 60)}"`, rawId!);
  }
  res.status(201).json(comment);
});

router.get("/bills/:id/audit", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const entries = await db.select().from(auditTable).where(eq(auditTable.billId, rawId!));
  res.json({ entries });
});

export default router;
