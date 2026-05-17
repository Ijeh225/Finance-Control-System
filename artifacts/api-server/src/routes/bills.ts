import { Router, type IRouter } from "express";
import { and, asc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db, billsTable, commentsTable, auditTable, vendorsTable, notificationsTable, billAttachmentsTable, walletsTable, walletTransactionsTable, usersTable } from "@workspace/db";

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

type Actor = { id: string; name: string; role: string };

/**
 * Fetch a bill and check read/write access.
 * MD: unrestricted. Non-MD: must be createdBy the actor.
 * Returns { bill, forbidden } — caller must handle both cases.
 */
async function loadBill(billId: string, actor: Actor) {
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId));
  if (!bill) return { bill: null, forbidden: false };
  if (actor.role !== "md" && bill.createdBy !== actor.id) return { bill, forbidden: true };
  return { bill, forbidden: false };
}

// ─── List ────────────────────────────────────────────────────────────────────

// ─── Auto-overdue helper ──────────────────────────────────────────────────────
// Flips any pending bill whose scheduledDate is in the past to "overdue".
// Called before every list/dashboard fetch so the status is always current.
async function markOverdueBills(userId?: string): Promise<void> {
  const t = new Date().toISOString().split("T")[0]!;
  const conditions: ReturnType<typeof eq>[] = [
    eq(billsTable.status, "pending"),
    lt(billsTable.scheduledDate, t),
  ];
  if (userId) conditions.push(eq(billsTable.createdBy, userId));
  await db.update(billsTable).set({ status: "overdue" }).where(and(...conditions));
}

router.get("/bills", async (req, res): Promise<void> => {
  const actor = req.user!;
  const query = req.query as Record<string, string>;
  const { status, vendorId, priority, from, to } = query;

  // Non-MD: always scoped to their own bills; ignore client-supplied userId
  const effectiveUserId = actor.role === "md" ? query["userId"] : actor.id;

  // Auto-flag any pending bills with a past scheduled date
  await markOverdueBills(effectiveUserId);

  const conditions: ReturnType<typeof eq>[] = [];
  if (effectiveUserId) conditions.push(eq(billsTable.createdBy, effectiveUserId));
  if (status) conditions.push(eq(billsTable.status, status as "pending"));
  if (vendorId) conditions.push(eq(billsTable.vendorId, vendorId));
  if (priority) conditions.push(eq(billsTable.priority, priority as "low"));
  if (from) conditions.push(gte(billsTable.scheduledDate, from));
  if (to) conditions.push(lte(billsTable.scheduledDate, to));

  const bills = await db.select().from(billsTable).where(conditions.length ? and(...conditions) : undefined);
  const total = bills.reduce((a, b) => a + parseFloat(String(b.amount)), 0);
  res.json({ bills: bills.map(b => formatBill(b as Record<string, unknown>)), total });
});

// ─── Create ──────────────────────────────────────────────────────────────────

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

// ─── Read single ─────────────────────────────────────────────────────────────

router.get("/bills/:id", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { bill, forbidden } = await loadBill(rawId!, actor);
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  if (forbidden) { res.status(403).json({ error: "Forbidden" }); return; }

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

// ─── Edit ────────────────────────────────────────────────────────────────────

router.patch("/bills/:id", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { bill: existing, forbidden } = await loadBill(rawId!, actor);
  if (!existing) { res.status(404).json({ error: "Bill not found" }); return; }
  if (forbidden) { res.status(403).json({ error: "Forbidden" }); return; }

  // Approved and paid bills cannot be edited
  if (["approved", "paid"].includes(existing.status)) {
    res.status(400).json({ error: `Cannot edit a bill with status '${existing.status}'` }); return;
  }
  // Non-MD users may only edit their own pending bills
  if (actor.role !== "md" && existing.status !== "pending") {
    res.status(403).json({ error: "You can only edit bills in pending status" }); return;
  }

  const { vendorId, description, amount, scheduledDate, dueDate, walletId, priority } = req.body;
  const updates: Record<string, unknown> = {};
  if (vendorId) {
    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
    if (!vendor) { res.status(400).json({ error: "Vendor not found" }); return; }
    updates["vendorId"] = vendorId;
    updates["vendorName"] = vendor.name;
  }
  if (description) updates["description"] = description;
  if (amount !== undefined) {
    const paidAmount = parseFloat(String(existing.paidAmount ?? 0));
    const newAmount = parseFloat(String(amount));
    updates["amount"] = String(newAmount);
    updates["outstandingBalance"] = String(Math.max(0, newAmount - paidAmount));
  }
  if (scheduledDate) updates["scheduledDate"] = scheduledDate;
  if (dueDate !== undefined) updates["dueDate"] = dueDate || null;
  if (walletId !== undefined) updates["walletId"] = walletId || null;
  if (priority) updates["priority"] = priority;

  // Re-enter the review queue when editing a held or overdue/escalated bill
  if (existing.status === "on_hold" || existing.status === "overdue") {
    updates["status"] = "pending";
  }

  const [bill] = await db.update(billsTable).set(updates).where(eq(billsTable.id, rawId!)).returning();
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }

  await addAudit(rawId!, actor.id, actor.name, "edited", "Bill details updated");
  res.json(formatBill(bill as unknown as Record<string, unknown>));
});

// ─── MD-only actions ─────────────────────────────────────────────────────────

router.post("/bills/:id/approve", async (req, res): Promise<void> => {
  const actor = req.user!;
  if (actor.role !== "md") { res.status(403).json({ error: "Only the MD can approve bills" }); return; }
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { comment, approvedAmount } = req.body ?? {};
  const [existing] = await db.select().from(billsTable).where(eq(billsTable.id, rawId!));
  if (!existing) { res.status(404).json({ error: "Bill not found" }); return; }
  const debitAmount = approvedAmount ? parseFloat(String(approvedAmount)) : parseFloat(String(existing.amount));
  const [bill] = await db.update(billsTable).set({ status: "approved", approvedAmount: String(debitAmount) }).where(eq(billsTable.id, rawId!)).returning();
  await addAudit(rawId!, actor.id, actor.name, "approved", comment ?? "Bill approved");
  if (comment) await db.insert(commentsTable).values({ id: uid(), billId: rawId!, authorId: actor.id, authorName: actor.name, authorRole: actor.role, text: comment });
  await notify(existing.createdBy, "bill_approved", "Bill Approved ✓", `Your bill for ${existing.vendorName} (${new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(debitAmount)}) has been approved. Tap to process payment.`, rawId!);
  res.json(formatBill(bill as unknown as Record<string, unknown>));
});

router.post("/bills/:id/reject", async (req, res): Promise<void> => {
  const actor = req.user!;
  if (actor.role !== "md") { res.status(403).json({ error: "Only the MD can reject bills" }); return; }
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
  if (actor.role !== "md") { res.status(403).json({ error: "Only the MD can hold bills" }); return; }
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
  if (actor.role !== "md") { res.status(403).json({ error: "Only the MD can partially approve bills" }); return; }
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { approvedAmount: additionalApproved, comment } = req.body ?? {};
  if (!additionalApproved) { res.status(400).json({ error: "approvedAmount is required" }); return; }
  const [existing] = await db.select().from(billsTable).where(eq(billsTable.id, rawId!));
  if (!existing) { res.status(404).json({ error: "Bill not found" }); return; }
  const totalAmount = parseFloat(String(existing.amount));
  const prevApproved = parseFloat(String(existing.approvedAmount ?? 0));
  const alreadyPaid = parseFloat(String(existing.paidAmount ?? 0));
  // Accumulate approved amounts across multiple rounds
  const newApprovedTotal = prevApproved + additionalApproved;
  if (newApprovedTotal > totalAmount + 0.01) {
    res.status(400).json({ error: `Total approved amount (${newApprovedTotal}) cannot exceed bill amount (${totalAmount})` }); return;
  }
  // Outstanding = what remains unpaid on the full bill
  const outstanding = Math.max(0, totalAmount - alreadyPaid);
  const [bill] = await db.update(billsTable).set({ status: "partial", approvedAmount: String(newApprovedTotal), outstandingBalance: String(outstanding) }).where(eq(billsTable.id, rawId!)).returning();
  await addAudit(rawId!, actor.id, actor.name, "partial_approved", comment ?? `Additional ${additionalApproved} approved — total approved: ${newApprovedTotal}`, String(prevApproved), String(newApprovedTotal));
  if (comment) await db.insert(commentsTable).values({ id: uid(), billId: rawId!, authorId: actor.id, authorName: actor.name, authorRole: actor.role, text: comment });
  await notify(existing.createdBy, "bill_partial", "Partial Approval ✓", `Your bill for ${existing.vendorName} has been approved for an additional ${new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(additionalApproved)} (total approved: ${new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(newApprovedTotal)}). Tap to process payment.`, rawId!);
  res.json(formatBill(bill as unknown as Record<string, unknown>));
});

// ─── Process Payment (Payment Assistant) ────────────────────────────────────

router.post("/bills/:id/pay", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];

  const { bill: existing, forbidden } = await loadBill(rawId!, actor);
  if (!existing) { res.status(404).json({ error: "Bill not found" }); return; }
  if (forbidden) { res.status(403).json({ error: "Forbidden" }); return; }

  // Only payment_assistant (or MD) can trigger this; must be the creator or MD
  if (actor.role !== "md" && actor.role !== "payment_assistant") {
    res.status(403).json({ error: "Only Payment Assistants or the MD can process payments" }); return;
  }

  // Bill must be in approved or partial state
  if (!["approved", "partial"].includes(existing.status)) {
    res.status(400).json({ error: `Cannot process payment for a bill with status '${existing.status}'` }); return;
  }

  const { walletId, amount, paymentReference, narration } = req.body ?? {};
  if (!walletId || !amount) {
    res.status(400).json({ error: "walletId and amount are required" }); return;
  }

  const payAmount = parseFloat(String(amount));
  if (isNaN(payAmount) || payAmount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }

  // Load and validate wallet
  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, walletId));
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

  const walletBalance = parseFloat(String(wallet.balance));
  if (walletBalance < payAmount) {
    res.status(400).json({ error: `Insufficient wallet balance. Available: ${walletBalance.toFixed(2)}, Required: ${payAmount.toFixed(2)}` }); return;
  }

  // Validate against approved amount
  const approvedAmount = parseFloat(String(existing.approvedAmount ?? existing.amount));
  const alreadyPaid = parseFloat(String(existing.paidAmount ?? 0));
  const remainingApproved = approvedAmount - alreadyPaid;
  if (payAmount > remainingApproved + 0.01) {
    res.status(400).json({ error: `Payment amount exceeds approved outstanding. Approved remaining: ${remainingApproved.toFixed(2)}` }); return;
  }

  const newPaidAmount = alreadyPaid + payAmount;
  const newOutstanding = parseFloat(String(existing.amount)) - newPaidAmount;
  // Bill is fully paid only when total paid >= full bill amount (not just approved amount)
  const isFullyPaid = newPaidAmount >= parseFloat(String(existing.amount)) - 0.01;
  const newStatus = isFullyPaid ? "paid" : "partial";

  const prevBalance = walletBalance;
  const newBalance = prevBalance - payAmount;
  const now = new Date();
  const ref = paymentReference || `FC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${uid().slice(0, 6).toUpperCase()}`;
  const txNarration = narration || `Payment to ${existing.vendorName} — Ref: ${ref}`;

  // 1. Debit wallet
  await db.update(walletsTable)
    .set({ balance: String(newBalance) })
    .where(eq(walletsTable.id, wallet.id));

  // 2. Record wallet transaction
  await db.insert(walletTransactionsTable).values({
    id: uid(),
    walletId: wallet.id,
    type: "bill_payment",
    amount: String(payAmount),
    balanceBefore: String(prevBalance),
    balanceAfter: String(newBalance),
    narration: txNarration,
    initiatedBy: actor.id,
    initiatedByName: actor.name,
    relatedWalletId: null,
    relatedWalletName: null,
    relatedBillId: rawId!,
  });

  // 3. Update bill
  const [bill] = await db.update(billsTable).set({
    status: newStatus,
    paidAmount: String(newPaidAmount),
    outstandingBalance: String(Math.max(0, newOutstanding)),
    paidBy: actor.id,
    paidByName: actor.name,
    paidAt: now,
    paymentReference: ref,
    paidWalletId: wallet.id,
    paidWalletName: wallet.name,
  }).where(eq(billsTable.id, rawId!)).returning();

  // 4. Update vendor totals
  await db.update(vendorsTable).set({
    totalPaid: sql`${vendorsTable.totalPaid} + ${String(payAmount)}`,
    outstandingBalance: sql`GREATEST(0, ${vendorsTable.outstandingBalance} - ${String(payAmount)})`,
  }).where(eq(vendorsTable.id, existing.vendorId));

  // 5. Audit
  const statusLabel = isFullyPaid ? "paid in full" : "partial payment processed";
  await addAudit(
    rawId!,
    actor.id,
    actor.name,
    "payment_processed",
    `${statusLabel} — ${new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(payAmount)} from ${wallet.name} (Ref: ${ref})`,
    String(alreadyPaid),
    String(newPaidAmount),
  );

  // 6. Notify MD
  const [mdUser] = await db.select().from(usersTable).where(eq(usersTable.role, "md"));
  if (mdUser) {
    const fmt = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(n);
    await notify(
      mdUser.id,
      "payment_processed",
      `Payment Processed — ${existing.vendorName}`,
      `${actor.name} processed ${fmt(payAmount)} to ${existing.vendorName} from ${wallet.name}. Ref: ${ref}. Remaining: ${fmt(Math.max(0, newOutstanding))}.`,
      rawId!,
    );
  }

  req.log.info({ billId: rawId, actor: actor.id, amount: payAmount, wallet: wallet.id, ref }, "Payment processed");
  res.json(formatBill(bill as unknown as Record<string, unknown>));
});

// ─── Escalate (creator or MD) ─────────────────────────────────────────────────

router.post("/bills/:id/escalate", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { bill: existing, forbidden } = await loadBill(rawId!, actor);
  if (!existing) { res.status(404).json({ error: "Bill not found" }); return; }
  if (forbidden) { res.status(403).json({ error: "Forbidden" }); return; }
  const { comment } = req.body ?? {};
  const [bill] = await db.update(billsTable).set({ priority: "urgent" }).where(eq(billsTable.id, rawId!)).returning();
  await addAudit(rawId!, actor.id, actor.name, "escalated", comment ?? "Bill escalated to urgent");
  if (comment) await db.insert(commentsTable).values({ id: uid(), billId: rawId!, authorId: actor.id, authorName: actor.name, authorRole: actor.role, text: comment });
  res.json(formatBill(bill as unknown as Record<string, unknown>));
});

// ─── Reschedule ───────────────────────────────────────────────────────────────

router.post("/bills/:id/reschedule", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { bill, forbidden } = await loadBill(rawId!, actor);
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  if (forbidden) { res.status(403).json({ error: "Forbidden" }); return; }

  const { scheduledDate } = req.body;
  if (!scheduledDate) { res.status(400).json({ error: "scheduledDate is required" }); return; }

  // Only partial or approved bills can be rescheduled; must be MD or a payment_assistant who is the creator
  if (!["partial", "approved"].includes(bill.status ?? "")) {
    res.status(400).json({ error: "Only partial or approved bills can be rescheduled" }); return;
  }
  if (actor.role !== "md" && (actor.role !== "payment_assistant" || bill.createdBy !== actor.id)) {
    res.status(403).json({ error: "Only the payment assistant who created this bill or MD can reschedule" }); return;
  }

  // Validate scheduledDate is a valid ISO date strictly in the future
  const parsedDate = new Date(scheduledDate);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (isNaN(parsedDate.getTime()) || parsedDate <= today) {
    res.status(400).json({ error: "scheduledDate must be a valid date in the future" }); return;
  }

  const [updated] = await db
    .update(billsTable)
    .set({ scheduledDate, updatedAt: new Date() })
    .where(eq(billsTable.id, rawId!))
    .returning();

  await addAudit(rawId!, actor.id, actor.name, "rescheduled",
    `Rescheduled to ${scheduledDate}`, bill.scheduledDate ?? undefined, scheduledDate);

  req.log.info({ billId: rawId, actor: actor.id, scheduledDate }, "Bill rescheduled");
  res.json(formatBill(updated as unknown as Record<string, unknown>));
});

// ─── Delete (MD only) ────────────────────────────────────────────────────────

router.delete("/bills/:id", async (req, res): Promise<void> => {
  const actor = req.user!;
  if (actor.role !== "md") { res.status(403).json({ error: "Only the MD can delete bills" }); return; }
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const [existing] = await db.select().from(billsTable).where(eq(billsTable.id, rawId!));
  if (!existing) { res.status(404).json({ error: "Bill not found" }); return; }

  // Reverse vendor financial totals
  const amount = parseFloat(String(existing.amount));
  const paidAmt = parseFloat(String(existing.paidAmount ?? 0));
  const outstanding = parseFloat(String(existing.outstandingBalance ?? 0));
  await db.update(vendorsTable).set({
    totalBilled: sql`GREATEST(0, ${vendorsTable.totalBilled} - ${String(amount)})`,
    totalPaid: paidAmt > 0 ? sql`GREATEST(0, ${vendorsTable.totalPaid} - ${String(paidAmt)})` : vendorsTable.totalPaid,
    outstandingBalance: sql`GREATEST(0, ${vendorsTable.outstandingBalance} - ${String(outstanding)})`,
  }).where(eq(vendorsTable.id, existing.vendorId));

  // Delete all related records
  await db.delete(commentsTable).where(eq(commentsTable.billId, rawId!));
  await db.delete(auditTable).where(eq(auditTable.billId, rawId!));
  await db.delete(billAttachmentsTable).where(eq(billAttachmentsTable.billId, rawId!));
  await db.delete(billsTable).where(eq(billsTable.id, rawId!));
  req.log.info({ billId: rawId, actor: actor.id }, "Bill deleted by MD");
  res.json({ success: true });
});

// ─── Withdraw ────────────────────────────────────────────────────────────────

router.post("/bills/:id/withdraw", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { bill, forbidden } = await loadBill(rawId!, actor);
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  if (forbidden) { res.status(403).json({ error: "Forbidden" }); return; }
  if (actor.id !== bill.createdBy) {
    res.status(403).json({ error: "Only the bill creator can withdraw it" }); return;
  }
  if (bill.status !== "pending") {
    res.status(400).json({ error: "Only pending bills can be withdrawn" }); return;
  }
  await db.delete(commentsTable).where(eq(commentsTable.billId, rawId!));
  await db.delete(auditTable).where(eq(auditTable.billId, rawId!));
  await db.delete(billAttachmentsTable).where(eq(billAttachmentsTable.billId, rawId!));
  await db.delete(billsTable).where(eq(billsTable.id, rawId!));
  req.log.info({ billId: rawId, actor: actor.id }, "Bill withdrawn");
  res.json({ success: true });
});

// ─── Comments ─────────────────────────────────────────────────────────────────

router.get("/bills/:id/comments", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { bill, forbidden } = await loadBill(rawId!, actor);
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  if (forbidden) { res.status(403).json({ error: "Forbidden" }); return; }
  const comments = await db.select().from(commentsTable)
    .where(eq(commentsTable.billId, rawId!))
    .orderBy(asc(commentsTable.createdAt));
  res.json({ comments });
});

router.post("/bills/:id/comments", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { bill, forbidden } = await loadBill(rawId!, actor);
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  if (forbidden) { res.status(403).json({ error: "Forbidden" }); return; }
  const { text } = req.body;
  if (!text?.trim()) { res.status(400).json({ error: "text is required" }); return; }
  const [comment] = await db.insert(commentsTable).values({
    id: uid(), billId: rawId!, authorId: actor.id,
    authorName: actor.name,
    authorRole: actor.role,
    text: text.trim(),
  }).returning();
  await addAudit(rawId!, actor.id, actor.name, "commented", text.trim());

  // Notify the other party:
  //   • PA commenting  → notify all MD users
  //   • MD commenting  → notify the PA who created the bill
  const snippet = `"${text.trim().slice(0, 60)}${text.trim().length > 60 ? "…" : ""}"`;
  if (actor.id === bill.createdBy) {
    // PA commenting — find all active MD users and notify them
    const mds = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.role, "md"), eq(usersTable.isActive, true)));
    await Promise.all(mds.map(md =>
      notify(md.id, "comment_added", "New Comment on Bill",
        `${actor.name} commented on a bill for ${bill.vendorName}: ${snippet}`, rawId!)
    ));
  } else {
    // MD (or someone else) commenting — notify the PA who created the bill
    await notify(bill.createdBy, "comment_added", "New Comment on Your Bill",
      `${actor.name} commented on your bill for ${bill.vendorName}: ${snippet}`, rawId!);
  }

  res.status(201).json(comment);
});

// ─── Audit trail ─────────────────────────────────────────────────────────────

router.get("/bills/:id/audit", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { bill, forbidden } = await loadBill(rawId!, actor);
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  if (forbidden) { res.status(403).json({ error: "Forbidden" }); return; }
  const entries = await db.select().from(auditTable)
    .where(eq(auditTable.billId, rawId!))
    .orderBy(asc(auditTable.createdAt));
  res.json({ entries });
});

export default router;
