import { Router, type IRouter } from "express";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, billsTable, vendorsTable } from "@workspace/db";
import { reportCache, ReportCache } from "../lib/cache";

const router: IRouter = Router();

function today() {
  return new Date().toISOString().split("T")[0]!;
}

/**
 * Resolve the effective userId filter based on session role.
 * MD: may pass ?userId= to filter; omit to see all users.
 * Non-MD: always scoped to their own id.
 */
function resolveUserId(req: { user?: { id: string; role: string }; query: Record<string, unknown> }): string | undefined {
  const actor = req.user!;
  if (actor.role === "md") {
    return req.query["userId"] as string | undefined;
  }
  return actor.id;
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
  const userId = resolveUserId(req as Parameters<typeof resolveUserId>[0]);
  const { from, to } = req.query as { from?: string; to?: string };

  const cacheKey = reportCache.buildKey(userId ?? "all", "outstanding-liabilities", from && to ? `${from}:${to}` : undefined);
  const cached = reportCache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  const conds: ReturnType<typeof eq>[] = [sql`${billsTable.outstandingBalance} > 0` as unknown as ReturnType<typeof eq>];
  if (userId) conds.push(eq(billsTable.createdBy, userId));
  if (from) conds.push(gte(billsTable.dueDate, from) as unknown as ReturnType<typeof eq>);
  if (to) conds.push(lte(billsTable.dueDate, to) as unknown as ReturnType<typeof eq>);

  const bills = await db.select().from(billsTable).where(and(...conds));
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

  const byUser = [...userMap.entries()].map(([uid, u]) => ({ userId: uid, userName: u.name, total: u.total }));

  const result = { totalOutstanding, aging0to7, aging8to14, aging15to30, aging30plus, byVendor, byUser, bills: bills.map(b => formatBill(b as unknown as Record<string, unknown>)) };
  reportCache.set(cacheKey, result, ReportCache.DETAILED_TTL_MS);
  res.json(result);
});

router.get("/reports/pending-approvals", async (req, res): Promise<void> => {
  const userId = resolveUserId(req as Parameters<typeof resolveUserId>[0]);
  const { from, to } = req.query as { from?: string; to?: string };

  const cacheKey = reportCache.buildKey(userId ?? "all", "pending-approvals", from && to ? `${from}:${to}` : undefined);
  const cached = reportCache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  const conds = [eq(billsTable.status, "pending")];
  if (userId) conds.push(eq(billsTable.createdBy, userId));
  if (from) conds.push(gte(billsTable.dueDate, from) as unknown as ReturnType<typeof eq>);
  if (to) conds.push(lte(billsTable.dueDate, to) as unknown as ReturnType<typeof eq>);

  const bills = await db.select().from(billsTable).where(and(...conds));
  const total = bills.reduce((a, b) => a + parseFloat(String(b.amount)), 0);
  const result = { bills: bills.map(b => formatBill(b as unknown as Record<string, unknown>)), total, count: bills.length };
  reportCache.set(cacheKey, result, ReportCache.DETAILED_TTL_MS);
  res.json(result);
});

router.get("/reports/paid-today", async (req, res): Promise<void> => {
  const userId = resolveUserId(req as Parameters<typeof resolveUserId>[0]);
  const { from, to } = req.query as { from?: string; to?: string };

  const cacheKey = reportCache.buildKey(userId ?? "all", "paid-today", from && to ? `${from}:${to}` : today());
  const cached = reportCache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  const conds = [eq(billsTable.status, "paid")];
  if (userId) conds.push(eq(billsTable.createdBy, userId));

  const bills = await db.select().from(billsTable).where(and(...conds));

  let filtered: typeof bills;
  if (from || to) {
    filtered = bills.filter(b => {
      if (!b.updatedAt) return false;
      const d = b.updatedAt.toISOString().split("T")[0]!;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  } else {
    const t = today();
    filtered = bills.filter(b => b.updatedAt && b.updatedAt.toISOString().split("T")[0] === t);
  }

  const total = filtered.reduce((a, b) => a + parseFloat(String(b.paidAmount ?? 0)), 0);
  const result = { bills: filtered.map(b => formatBill(b as unknown as Record<string, unknown>)), total, count: filtered.length };
  // Paid-today data changes frequently — use dashboard TTL (5 min)
  reportCache.set(cacheKey, result, ReportCache.DASHBOARD_TTL_MS);
  res.json(result);
});

router.get("/reports/partial-payments", async (req, res): Promise<void> => {
  const userId = resolveUserId(req as Parameters<typeof resolveUserId>[0]);
  const { from, to } = req.query as { from?: string; to?: string };

  const cacheKey = reportCache.buildKey(userId ?? "all", "partial-payments", from && to ? `${from}:${to}` : undefined);
  const cached = reportCache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  const conds = [eq(billsTable.status, "partial")];
  if (userId) conds.push(eq(billsTable.createdBy, userId));
  if (from) conds.push(gte(billsTable.dueDate, from) as unknown as ReturnType<typeof eq>);
  if (to) conds.push(lte(billsTable.dueDate, to) as unknown as ReturnType<typeof eq>);

  const bills = await db.select().from(billsTable).where(and(...conds));
  const total = bills.reduce((a, b) => a + parseFloat(String(b.outstandingBalance ?? 0)), 0);
  const result = { bills: bills.map(b => formatBill(b as unknown as Record<string, unknown>)), total };
  reportCache.set(cacheKey, result, ReportCache.DETAILED_TTL_MS);
  res.json(result);
});

export default router;
