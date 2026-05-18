import { Router, type IRouter } from "express";
import { eq, ilike, and, sql, ne, inArray, or } from "drizzle-orm";
import { db, vendorsTable, billsTable, auditTable, walletTransactionsTable } from "@workspace/db";

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
  const actor = req.user!;
  const search = req.query["search"] as string | undefined;

  if (actor.role !== "md") {
    // PA: see vendors they created OR have at least one bill with
    const rows = await db.selectDistinct({ vendorId: billsTable.vendorId })
      .from(billsTable)
      .where(eq(billsTable.createdBy, actor.id));
    const billVendorIds = rows.map(r => r.vendorId);

    const accessCond = billVendorIds.length
      ? or(eq(vendorsTable.createdBy, actor.id), inArray(vendorsTable.id, billVendorIds))!
      : eq(vendorsTable.createdBy, actor.id);

    const conds = search ? [accessCond, ilike(vendorsTable.name, `%${search}%`)] : [accessCond];
    const vendors = await db.select().from(vendorsTable).where(and(...conds));
    res.json({ vendors: vendors.map(formatVendor) });
    return;
  }

  // MD: all vendors
  const vendors = search
    ? await db.select().from(vendorsTable).where(ilike(vendorsTable.name, `%${search}%`))
    : await db.select().from(vendorsTable);
  res.json({ vendors: vendors.map(formatVendor) });
});

router.post("/vendors", async (req, res): Promise<void> => {
  const actor = req.user!;
  const { name, phone, email, bankName, accountNumber, containers, requestPurpose, relatedLink } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const [vendor] = await db.insert(vendorsTable).values({
    id: uid(), name, phone, email, bankName, accountNumber,
    containers: containers || null, requestPurpose: requestPurpose || null, relatedLink: relatedLink || null,
    createdBy: actor.id,
  }).returning();
  res.status(201).json(formatVendor(vendor as Record<string, unknown>));
});

router.get("/vendors/:id", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, rawId!));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  // PA: must have created the vendor OR have at least one bill with it
  if (actor.role !== "md") {
    const isCreator = vendor.createdBy === actor.id;
    if (!isCreator) {
      const [check] = await db.select({ id: billsTable.id }).from(billsTable)
        .where(and(eq(billsTable.vendorId, rawId!), eq(billsTable.createdBy, actor.id)))
        .limit(1);
      if (!check) { res.status(403).json({ error: "Access denied" }); return; }
    }
  }

  // Bills: PA sees only their own; MD sees all (excluding withdrawn)
  const billConds = [eq(billsTable.vendorId, rawId!), ne(billsTable.status, "withdrawn")];
  if (actor.role !== "md") billConds.push(eq(billsTable.createdBy, actor.id));
  const bills = await db.select().from(billsTable).where(and(...billConds));

  // Activity: scope to PA's bills only
  const activityFilter = actor.role !== "md"
    ? sql`${auditTable.billId} IN (SELECT id FROM bills WHERE vendor_id = ${rawId} AND created_by = ${actor.id})`
    : sql`${auditTable.billId} IN (SELECT id FROM bills WHERE vendor_id = ${rawId})`;
  const activity = await db.select().from(auditTable).where(activityFilter).limit(20);

  res.json({ ...formatVendor(vendor as Record<string, unknown>), bills: bills.map(formatBill), recentActivity: activity });
});

router.patch("/vendors/:id", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const [existing] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, rawId!));
  if (!existing) { res.status(404).json({ error: "Vendor not found" }); return; }

  // PA: can only edit a vendor they created or have a bill with
  if (actor.role !== "md") {
    const isCreator = existing.createdBy === actor.id;
    if (!isCreator) {
      const [check] = await db.select({ id: billsTable.id }).from(billsTable)
        .where(and(eq(billsTable.vendorId, rawId!), eq(billsTable.createdBy, actor.id)))
        .limit(1);
      if (!check) { res.status(403).json({ error: "Access denied" }); return; }
    }
  }

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

router.get("/vendors/:id/spending", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, rawId!));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  // PA: must have created the vendor OR have a bill with it
  if (actor.role !== "md") {
    const isCreator = vendor.createdBy === actor.id;
    if (!isCreator) {
      const [check] = await db.select({ id: billsTable.id }).from(billsTable)
        .where(and(eq(billsTable.vendorId, rawId!), eq(billsTable.createdBy, actor.id)))
        .limit(1);
      if (!check) { res.status(403).json({ error: "Access denied" }); return; }
    }
  }

  // Get bill_payment transactions scoped to actor's bills for this vendor
  const txRows = await db.select({
    amount: walletTransactionsTable.amount,
    createdAt: walletTransactionsTable.createdAt,
  }).from(walletTransactionsTable)
    .where(sql`
      ${walletTransactionsTable.type} = 'bill_payment'
      AND ${walletTransactionsTable.relatedBillId} IN (
        SELECT id FROM bills WHERE vendor_id = ${rawId}${actor.role !== "md" ? sql` AND created_by = ${actor.id}` : sql``}
      )
    `);

  // Bucket by YYYY-MM
  const buckets = new Map<string, number>();
  let totalPaid = 0;
  for (const tx of txRows) {
    const amt = parseFloat(String(tx.amount));
    totalPaid += amt;
    const month = tx.createdAt.toISOString().slice(0, 7); // "YYYY-MM"
    buckets.set(month, (buckets.get(month) ?? 0) + amt);
  }

  // Sort ascending and build array
  const months = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount }));

  res.json({ vendorId: rawId, vendorName: vendor.name, totalPaid, months });
});

router.get("/vendors/:id/liabilities", async (req, res): Promise<void> => {
  const actor = req.user!;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, rawId!));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  // PA: must have created the vendor OR have a bill with it
  if (actor.role !== "md") {
    const isCreator = vendor.createdBy === actor.id;
    if (!isCreator) {
      const [check] = await db.select({ id: billsTable.id }).from(billsTable)
        .where(and(eq(billsTable.vendorId, rawId!), eq(billsTable.createdBy, actor.id)))
        .limit(1);
      if (!check) { res.status(403).json({ error: "Access denied" }); return; }
    }
  }

  const liabilityConds = [eq(billsTable.vendorId, rawId!), sql`${billsTable.outstandingBalance} > 0`];
  if (actor.role !== "md") liabilityConds.push(eq(billsTable.createdBy, actor.id));
  const bills = await db.select().from(billsTable).where(and(...liabilityConds));

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
