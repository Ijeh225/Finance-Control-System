import { Router, type IRouter } from "express";
import { and, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db, billsTable, walletsTable, notificationsTable, auditTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

function today() {
  return new Date().toISOString().split("T")[0]!;
}
function tomorrow() {
  return new Date(Date.now() + 86400000).toISOString().split("T")[0]!;
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const userId = req.query["userId"] as string | undefined;
  const userFilter = userId ? eq(billsTable.createdBy, userId) : undefined;

  const t = today();
  const tom = tomorrow();

  const [bills, wallets, notifications] = await Promise.all([
    db.select().from(billsTable).where(userFilter),
    db.select().from(walletsTable),
    userId
      ? db.select().from(notificationsTable).where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)))
      : db.select().from(notificationsTable).where(eq(notificationsTable.isRead, false)),
  ]);

  const scheduledToday = bills.filter(b => b.scheduledDate === t);
  const scheduledTomorrow = bills.filter(b => b.scheduledDate === tom);
  const pending = bills.filter(b => b.status === "pending");
  const approvedUnpaid = bills.filter(b => b.status === "approved");
  const overdue = bills.filter(b => b.status === "overdue");
  const paidToday = bills.filter(b => b.status === "paid" && b.updatedAt && b.updatedAt.toISOString().split("T")[0] === t);
  const partial = bills.filter(b => b.status === "partial");

  const sum = (arr: typeof bills, field: "amount" | "outstandingBalance" | "paidAmount") =>
    arr.reduce((acc, b) => acc + parseFloat(String(b[field] ?? 0)), 0);

  const totalWalletBalance = wallets.reduce((acc, w) => acc + parseFloat(String(w.balance)), 0);
  const totalOutstanding = bills.reduce((acc, b) => acc + parseFloat(String(b.outstandingBalance ?? 0)), 0);

  res.json({
    scheduledTodayCount: scheduledToday.length,
    scheduledTodayAmount: sum(scheduledToday, "amount"),
    scheduledTomorrowCount: scheduledTomorrow.length,
    scheduledTomorrowAmount: sum(scheduledTomorrow, "amount"),
    pendingApprovalCount: pending.length,
    pendingApprovalAmount: sum(pending, "amount"),
    approvedUnpaidCount: approvedUnpaid.length,
    approvedUnpaidAmount: sum(approvedUnpaid, "amount"),
    totalOutstandingLiabilities: totalOutstanding,
    overdueCount: overdue.length,
    overdueAmount: sum(overdue, "outstandingBalance"),
    totalWalletBalance,
    paidTodayCount: paidToday.length,
    paidTodayAmount: sum(paidToday, "paidAmount"),
    partialPaymentsCount: partial.length,
    partialPaymentsAmount: sum(partial, "outstandingBalance"),
    unreadNotificationsCount: notifications.length,
  });
});

router.get("/dashboard/scheduled-today", async (req, res): Promise<void> => {
  const userId = req.query["userId"] as string | undefined;
  const t = today();
  const conditions = [eq(billsTable.scheduledDate, t)];
  if (userId) conditions.push(eq(billsTable.createdBy, userId));
  const bills = await db.select().from(billsTable).where(and(...conditions));
  const total = bills.reduce((a, b) => a + parseFloat(String(b.amount)), 0);
  res.json({ bills: bills.map(formatBill), total });
});

router.get("/dashboard/scheduled-tomorrow", async (req, res): Promise<void> => {
  const userId = req.query["userId"] as string | undefined;
  const tom = tomorrow();
  const conditions = [eq(billsTable.scheduledDate, tom)];
  if (userId) conditions.push(eq(billsTable.createdBy, userId));
  const bills = await db.select().from(billsTable).where(and(...conditions));
  const total = bills.reduce((a, b) => a + parseFloat(String(b.amount)), 0);
  res.json({ bills: bills.map(formatBill), total });
});

router.get("/dashboard/overdue", async (req, res): Promise<void> => {
  const userId = req.query["userId"] as string | undefined;
  const conditions = [eq(billsTable.status, "overdue")];
  if (userId) conditions.push(eq(billsTable.createdBy, userId));
  const bills = await db.select().from(billsTable).where(and(...conditions));
  const total = bills.reduce((a, b) => a + parseFloat(String(b.outstandingBalance ?? 0)), 0);
  res.json({ bills: bills.map(formatBill), total });
});

router.get("/dashboard/wallet-balances", async (_req, res): Promise<void> => {
  const wallets = await db.select().from(walletsTable);
  const totalBalance = wallets.reduce((a, w) => a + parseFloat(String(w.balance)), 0);
  res.json({ wallets: wallets.map(formatWallet), totalBalance });
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  const userId = req.query["userId"] as string | undefined;
  const limit = parseInt(String(req.query["limit"] ?? "20"));
  const conditions = userId ? [eq(auditTable.userId, userId)] : [];
  const entries = await db
    .select()
    .from(auditTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${auditTable.createdAt} desc`)
    .limit(limit);
  res.json({ activities: entries.map(formatAudit) });
});

function formatBill(b: Record<string, unknown>) {
  return {
    ...b,
    amount: parseFloat(String(b["amount"] ?? 0)),
    approvedAmount: b["approvedAmount"] != null ? parseFloat(String(b["approvedAmount"])) : undefined,
    paidAmount: parseFloat(String(b["paidAmount"] ?? 0)),
    outstandingBalance: parseFloat(String(b["outstandingBalance"] ?? 0)),
    createdAt: b["createdAt"],
    updatedAt: b["updatedAt"],
  };
}

function formatWallet(w: Record<string, unknown>) {
  return { ...w, balance: parseFloat(String(w["balance"] ?? 0)) };
}

function formatAudit(a: Record<string, unknown>) {
  return { ...a };
}

export default router;
