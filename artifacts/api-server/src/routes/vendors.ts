import { Router, type IRouter } from "express";
import { eq, ilike, and, sql } from "drizzle-orm";
import { db, vendorsTable, billsTable, auditTable } from "@workspace/db";

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

function formatVendor(v: Record<string, unknown>) {
  return {
    ...v,
    totalBilled: parseFloat(String(v["totalBilled"] ?? 0)),
    totalPaid: parseFloat(String(v["totalPaid"] ?? 0)),
    outstandingBalance: parseFloat(String(v["outstandingBalance"] ?? 0)),
  };
}

router.get("/vendors", async (req, res): Promise<void> => {
  const search = req.query["search"] as string | undefined;
  const vendors = search
    ? await db.select().from(vendorsTable).where(ilike(vendorsTable.name, `%${search}%`))
    : await db.select().from(vendorsTable);
  res.json({ vendors: vendors.map(formatVendor) });
});

router.post("/vendors", async (req, res): Promise<void> => {
  const { name, phone, email, bankName, accountNumber, containers, requestPurpose, relatedLink } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const [vendor] = await db.insert(vendorsTable).values({
    id: uid(), name, phone, email, bankName, accountNumber,
    containers: containers || null, requestPurpose: requestPurpose || null, relatedLink: relatedLink || null,
  }).returning();
  res.status(201).json(formatVendor(vendor as Record<string, unknown>));
});

router.get("/vendors/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, rawId!));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  const bills = await db.select().from(billsTable).where(eq(billsTable.vendorId, rawId!));
  const activity = await db.select().from(auditTable)
    .where(sql`${auditTable.billId} IN (SELECT id FROM bills WHERE vendor_id = ${rawId})`)
    .limit(20);
  res.json({ ...formatVendor(vendor as Record<string, unknown>), bills: bills.map(formatBill), recentActivity: activity });
});

router.patch("/vendors/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const [existing] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, rawId!));
  if (!existing) { res.status(404).json({ error: "Vendor not found" }); return; }

  const { name, phone, email, bankName, accountNumber, containers, requestPurpose, relatedLink } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates["name"] = name;
  if (phone !== undefined) updates["phone"] = phone || null;
  if (email !== undefined) updates["email"] = email || null;
  if (bankName !== undefined) updates["bankName"] = bankName || null;
  if (accountNumber !== undefined) updates["accountNumber"] = accountNumber || null;
  if (containers !== undefined) updates["containers"] = containers || null;
  if (requestPurpose !== undefined) updates["requestPurpose"] = requestPurpose || null;
  if (relatedLink !== undefined) updates["relatedLink"] = relatedLink || null;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" }); return;
  }

  const [vendor] = await db.update(vendorsTable).set(updates).where(eq(vendorsTable.id, rawId!)).returning();
  req.log.info({ vendorId: rawId, actor: req.user!.id }, "Vendor updated");
  res.json(formatVendor(vendor as Record<string, unknown>));
});

router.delete("/vendors/:id", async (req, res): Promise<void> => {
  const actor = req.user!;
  if (actor.role !== "md") { res.status(403).json({ error: "Only the MD can delete vendors" }); return; }
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, rawId!));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const activeBills = await db.select({ id: billsTable.id }).from(billsTable).where(
    and(
      eq(billsTable.vendorId, rawId!),
      sql`${billsTable.status} NOT IN ('paid', 'rejected')`
    )
  );
  if (activeBills.length > 0) {
    res.status(409).json({ error: `Cannot delete vendor — ${activeBills.length} active bill(s) must be resolved first` });
    return;
  }

  await db.delete(vendorsTable).where(eq(vendorsTable.id, rawId!));
  req.log.info({ vendorId: rawId, actor: actor.id }, "Vendor deleted by MD");
  res.json({ success: true });
});

router.get("/vendors/:id/liabilities", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, rawId!));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const bills = await db.select().from(billsTable).where(
    and(eq(billsTable.vendorId, rawId!), sql`${billsTable.outstandingBalance} > 0`)
  );

  const now = Date.now();
  let aging0to7 = 0, aging8to14 = 0, aging15to30 = 0, aging30plus = 0;
  for (const b of bills) {
    const daysOld = Math.floor((now - b.createdAt.getTime()) / 86400000);
    const bal = parseFloat(String(b.outstandingBalance ?? 0));
    if (daysOld <= 7) aging0to7 += bal;
    else if (daysOld <= 14) aging8to14 += bal;
    else if (daysOld <= 30) aging15to30 += bal;
    else aging30plus += bal;
  }

  res.json({
    vendorId: rawId,
    vendorName: vendor.name,
    totalOutstanding: parseFloat(String(vendor.outstandingBalance)),
    aging0to7, aging8to14, aging15to30, aging30plus,
  });
});

export default router;
