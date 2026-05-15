import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, billsTable, vendorsTable } from "@workspace/db";

const router: IRouter = Router();

function today() {
  return new Date().toISOString().split("T")[0]!;
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

router.get("/reports/outstanding-liabilities", async (req, res): Promise<void> => {
  const userId = req.query["userId"] as string | undefined;
  const conds = userId ? [eq(billsTable.createdBy, userId)] : [];
  const bills = await db.select().from(billsTable).where(
    and(...conds, sql`${billsTable.outstandingBalance} > 0`)
  );
  const vendors = await db.select().from(vendorsTable);

  const now = Date.now();
  let aging0to7 = 0, aging8to14 = 0, aging15to30 = 0, aging30plus = 0, totalOutstanding = 0;
  const vendorMap = new Map<string, { name: string; total: number }>();
  const userMap = new Map<string, { name: string; total: number }>();

  for (const b of bills) {
    const bal = parseFloat(String(b.outstandingBalance ?? 0));
    totalOutstanding += bal;
    const daysOld = Math.floor((now - b.createdAt.getTime()) / 86400000);
    if (daysOld <= 7) aging0to7 += bal;
    else if (daysOld <= 14) aging8to14 += bal;
    else if (daysOld <= 30) aging15to30 += bal;
    else aging30plus += bal;

    const vEntry = vendorMap.get(b.vendorId) ?? { name: b.vendorName, total: 0 };
    vEntry.total += bal;
    vendorMap.set(b.vendorId, vEntry);

    const uEntry = userMap.get(b.createdBy) ?? { name: b.createdByName, total: 0 };
    uEntry.total += bal;
    userMap.set(b.createdBy, uEntry);
  }

  const byVendor = [...vendorMap.entries()].map(([vendorId, v]) => {
    const vendor = vendors.find(vv => vv.id === vendorId);
    return {
      vendorId, vendorName: v.name, totalOutstanding: v.total,
      aging0to7: 0, aging8to14: 0, aging15to30: 0, aging30plus: 0,
      ...(vendor ? { totalBilled: parseFloat(String(vendor.totalBilled)), totalPaid: parseFloat(String(vendor.totalPaid)) } : {}),
    };
  });

  const byUser = [...userMap.entries()].map(([userId, u]) => ({ userId, userName: u.name, total: u.total }));

  res.json({ totalOutstanding, aging0to7, aging8to14, aging15to30, aging30plus, byVendor, byUser });
});

router.get("/reports/pending-approvals", async (req, res): Promise<void> => {
  const userId = req.query["userId"] as string | undefined;
  const conds = [eq(billsTable.status, "pending")];
  if (userId) conds.push(eq(billsTable.createdBy, userId));
  const bills = await db.select().from(billsTable).where(and(...conds));
  const total = bills.reduce((a, b) => a + parseFloat(String(b.amount)), 0);
  res.json({ bills: bills.map(b => formatBill(b as unknown as Record<string, unknown>)), total, count: bills.length });
});

router.get("/reports/paid-today", async (req, res): Promise<void> => {
  const userId = req.query["userId"] as string | undefined;
  const t = today();
  const conds = [eq(billsTable.status, "paid")];
  if (userId) conds.push(eq(billsTable.createdBy, userId));
  const bills = await db.select().from(billsTable).where(and(...conds));
  const paidToday = bills.filter(b => b.updatedAt && b.updatedAt.toISOString().split("T")[0] === t);
  const total = paidToday.reduce((a, b) => a + parseFloat(String(b.paidAmount ?? 0)), 0);
  res.json({ bills: paidToday.map(b => formatBill(b as unknown as Record<string, unknown>)), total, count: paidToday.length });
});

router.get("/reports/partial-payments", async (req, res): Promise<void> => {
  const userId = req.query["userId"] as string | undefined;
  const conds = [eq(billsTable.status, "partial")];
  if (userId) conds.push(eq(billsTable.createdBy, userId));
  const bills = await db.select().from(billsTable).where(and(...conds));
  const total = bills.reduce((a, b) => a + parseFloat(String(b.outstandingBalance ?? 0)), 0);
  res.json({ bills: bills.map(b => formatBill(b as unknown as Record<string, unknown>)), total });
});

export default router;
