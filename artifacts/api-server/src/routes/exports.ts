import { Router, type IRouter } from "express";
import { and, eq, desc, gt } from "drizzle-orm";
import { db, billsTable, vendorsTable, walletTransactionsTable, walletsTable } from "@workspace/db";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { logger, auditLog } from "../lib/logger";

/** Timeout (ms) for export operations — prevents hanging on very large datasets. */
const EXPORT_TIMEOUT_MS = 60_000;

const router: IRouter = Router();

function today() {
  return new Date().toISOString().split("T")[0]!;
}

function resolveUserId(actor: { id: string; role: string }, query: Record<string, unknown>): string | undefined {
  if (actor.role === "md") return query["userId"] as string | undefined;
  return actor.id;
}

function fmtAmt(n: unknown) {
  return parseFloat(String(n ?? 0));
}

function fmtDate(s: unknown) {
  if (!s) return "";
  if (s instanceof Date) return s.toISOString().split("T")[0] ?? "";
  return String(s).split("T")[0] ?? "";
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(n);
}

function applyHeaderStyle(row: ExcelJS.Row, primaryColor: string) {
  row.eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: primaryColor } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FFAAAAAA" } },
    };
  });
  row.height = 22;
}

// ─── Report exports ────────────────────────────────────────────────────────

/**
 * GET /export/reports/:type
 * type: outstanding-liabilities | pending-approvals | paid-today | partial-payments
 * Query: ?format=excel|pdf  (default: excel)
 */
router.get("/export/reports/:type", async (req, res): Promise<void> => {
  const actor = req.user!;
  const type = req.params["type"];
  const format = (req.query["format"] as string) || "excel";
  const userId = resolveUserId(actor, req.query as Record<string, unknown>);

  const validTypes = ["outstanding-liabilities", "pending-approvals", "paid-today", "partial-payments"];
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: "Invalid report type" });
    return;
  }

  // Abort the export if it takes longer than EXPORT_TIMEOUT_MS
  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      logger.error({ userId: actor.id, type, format }, "Export timed out");
      res.status(504).json({ error: "Export timed out. The dataset may be too large — try filtering by date range." });
    }
  }, EXPORT_TIMEOUT_MS);

  try {
    let bills: (typeof billsTable.$inferSelect)[] = [];
    let title = "Report";

    if (type === "outstanding-liabilities") {
      title = "Outstanding Liabilities";
      const conds = [gt(billsTable.outstandingBalance, "0")];
      if (userId) conds.push(eq(billsTable.createdBy, userId));
      bills = await db.select().from(billsTable).where(and(...conds)).orderBy(desc(billsTable.createdAt));
    } else if (type === "pending-approvals") {
      title = "Pending Approvals";
      const conds = [eq(billsTable.status, "pending")];
      if (userId) conds.push(eq(billsTable.createdBy, userId));
      bills = await db.select().from(billsTable).where(and(...conds));
    } else if (type === "paid-today") {
      title = "Paid Today";
      const t = today();
      const conds = [eq(billsTable.status, "paid")];
      if (userId) conds.push(eq(billsTable.createdBy, userId));
      const all = await db.select().from(billsTable).where(and(...conds));
      bills = all.filter(b => b.updatedAt && b.updatedAt.toISOString().split("T")[0] === t);
    } else if (type === "partial-payments") {
      title = "Partial Payments";
      const conds = [eq(billsTable.status, "partial")];
      if (userId) conds.push(eq(billsTable.createdBy, userId));
      bills = await db.select().from(billsTable).where(and(...conds));
    }

    auditLog("export.generated", {
      userId: actor.id,
      userRole: actor.role,
      ip: req.ip,
      resource: "report",
      details: { type, format, recordCount: bills.length },
    });

    if (format === "pdf") {
      await sendBillsPdf(res, title, bills);
    } else {
      await sendBillsExcel(res, title, bills);
    }
  } catch (err) {
    logger.error({ err, userId: actor.id, type, format }, "Report export failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "Export failed. Please try again or contact support if the problem persists." });
    }
  } finally {
    clearTimeout(timeoutId);
  }
});

async function sendBillsExcel(res: import("express").Response, title: string, bills: (typeof billsTable.$inferSelect)[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FinCommand";
  wb.created = new Date();
  const ws = wb.addWorksheet(title);

  ws.columns = [
    { header: "Vendor", key: "vendor", width: 28 },
    { header: "Description", key: "desc", width: 36 },
    { header: "Amount (NGN)", key: "amount", width: 18 },
    { header: "Approved Amount", key: "approved", width: 18 },
    { header: "Outstanding", key: "outstanding", width: 18 },
    { header: "Status", key: "status", width: 14 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Due Date", key: "due", width: 14 },
    { header: "Submitted By", key: "by", width: 22 },
    { header: "Created At", key: "created", width: 18 },
  ];

  applyHeaderStyle(ws.getRow(1), "FF1E3A5F");

  for (const b of bills) {
    const row = ws.addRow({
      vendor: b.vendorName,
      desc: b.description,
      amount: fmtAmt(b.amount),
      approved: b.approvedAmount != null ? fmtAmt(b.approvedAmount) : "",
      outstanding: fmtAmt(b.outstandingBalance),
      status: (b.status ?? "").replace("_", " "),
      priority: b.priority,
      due: fmtDate(b.dueDate),
      by: b.createdByName,
      created: fmtDate(b.createdAt),
    });

    ["amount", "approved", "outstanding"].forEach(k => {
      const cell = row.getCell(k);
      cell.numFmt = '#,##0.00';
    });
  }

  ws.addRow([]);
  const totalRow = ws.addRow({
    vendor: "TOTAL",
    amount: bills.reduce((s, b) => s + fmtAmt(b.amount), 0),
    outstanding: bills.reduce((s, b) => s + fmtAmt(b.outstandingBalance), 0),
  });
  totalRow.font = { bold: true };
  ["amount", "outstanding"].forEach(k => { totalRow.getCell(k).numFmt = '#,##0.00'; });

  const slug = title.toLowerCase().replace(/\s+/g, "-");
  res.setHeader("Content-Disposition", `attachment; filename="fincommand-${slug}-${today()}.xlsx"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  await wb.xlsx.write(res);
  res.end();
}

async function sendBillsPdf(res: import("express").Response, title: string, bills: (typeof billsTable.$inferSelect)[]) {
  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
  res.setHeader("Content-Disposition", `attachment; filename="fincommand-${title.toLowerCase().replace(/\s+/g, "-")}-${today()}.pdf"`);
  res.setHeader("Content-Type", "application/pdf");
  doc.pipe(res);

  doc.fontSize(18).font("Helvetica-Bold").text("FinCommand — Executive Treasury", { align: "center" });
  doc.fontSize(13).font("Helvetica").text(title, { align: "center" });
  doc.fontSize(9).fillColor("#666").text(`Generated: ${new Date().toLocaleString("en-NG")} · ${bills.length} record(s)`, { align: "center" });
  doc.moveDown();
  doc.fillColor("#000");

  const headers = ["Vendor", "Description", "Amount", "Outstanding", "Status", "Due Date", "Submitted By"];
  const colWidths = [110, 160, 90, 90, 70, 80, 110];
  const startX = 40;
  let y = doc.y;

  doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), 18).fill("#1E3A5F");
  let x = startX;
  headers.forEach((h, i) => {
    doc.fillColor("#fff").font("Helvetica-Bold").fontSize(8).text(h, x + 3, y + 4, { width: colWidths[i]! - 6 });
    x += colWidths[i]!;
  });
  y += 18;

  for (let idx = 0; idx < bills.length; idx++) {
    const b = bills[idx]!;
    const bg = idx % 2 === 0 ? "#F7F9FC" : "#FFFFFF";
    const rowH = 16;
    doc.rect(startX, y, colWidths.reduce((a, v) => a + v, 0), rowH).fill(bg);
    x = startX;
    const cells = [
      b.vendorName,
      b.description.slice(0, 40),
      formatCurrency(fmtAmt(b.amount)),
      formatCurrency(fmtAmt(b.outstandingBalance)),
      (b.status ?? "").replace("_", " "),
      fmtDate(b.dueDate),
      b.createdByName,
    ];
    cells.forEach((cell, i) => {
      doc.fillColor("#111").font("Helvetica").fontSize(7.5).text(String(cell), x + 3, y + 3, { width: colWidths[i]! - 6, lineBreak: false });
      x += colWidths[i]!;
    });
    y += rowH;
    if (y > 540) { doc.addPage({ layout: "landscape" }); y = 40; }
  }

  doc.end();
}

// ─── Vendor statement export ──────────────────────────────────────────────

/**
 * GET /export/vendors/:id/statement
 * Export vendor payment history as Excel or PDF.
 * Query: ?format=excel|pdf
 */
router.get("/export/vendors/:id/statement", async (req, res): Promise<void> => {
  const actor = req.user!;
  const vendorId = req.params["id"];
  const format = (req.query["format"] as string) || "excel";

  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      logger.error({ userId: actor.id, vendorId, format }, "Vendor statement export timed out");
      res.status(504).json({ error: "Export timed out. Please try again." });
    }
  }, EXPORT_TIMEOUT_MS);

  try {
    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
    if (!vendor) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }

    const conds = [eq(billsTable.vendorId, vendorId)];
    if (actor.role !== "md") conds.push(eq(billsTable.createdBy, actor.id));
    const bills = await db.select().from(billsTable).where(and(...conds));

    auditLog("export.generated", {
      userId: actor.id,
      userRole: actor.role,
      ip: req.ip,
      resource: "vendor_statement",
      resourceId: vendorId,
      details: { format, recordCount: bills.length, vendorName: vendor.name },
    });

    if (format === "pdf") {
      await sendVendorPdf(res, vendor, bills);
    } else {
      await sendVendorExcel(res, vendor, bills);
    }
  } catch (err) {
    logger.error({ err, userId: actor.id, vendorId, format }, "Vendor statement export failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "Export failed. Please try again or contact support." });
    }
  } finally {
    clearTimeout(timeoutId);
  }
});

async function sendVendorExcel(res: import("express").Response, vendor: typeof vendorsTable.$inferSelect, bills: (typeof billsTable.$inferSelect)[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FinCommand";
  const ws = wb.addWorksheet("Vendor Statement");

  ws.mergeCells("A1:J1");
  ws.getCell("A1").value = `Vendor Statement — ${vendor.name}`;
  ws.getCell("A1").font = { bold: true, size: 14 };

  ws.addRow([]);

  ws.columns = [
    { header: "Description", key: "desc", width: 36 },
    { header: "Amount (NGN)", key: "amount", width: 18 },
    { header: "Approved Amount", key: "approved", width: 18 },
    { header: "Paid Amount", key: "paid", width: 18 },
    { header: "Outstanding", key: "outstanding", width: 18 },
    { header: "Status", key: "status", width: 14 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Due Date", key: "due", width: 14 },
    { header: "Scheduled Date", key: "scheduled", width: 16 },
    { header: "Submitted By", key: "by", width: 22 },
  ];
  applyHeaderStyle(ws.getRow(3), "FF1E3A5F");

  for (const b of bills) {
    const row = ws.addRow({
      desc: b.description,
      amount: fmtAmt(b.amount),
      approved: b.approvedAmount != null ? fmtAmt(b.approvedAmount) : "",
      paid: fmtAmt(b.paidAmount),
      outstanding: fmtAmt(b.outstandingBalance),
      status: (b.status ?? "").replace("_", " "),
      priority: b.priority,
      due: fmtDate(b.dueDate),
      scheduled: fmtDate(b.scheduledDate),
      by: b.createdByName,
    });
    ["amount", "approved", "paid", "outstanding"].forEach(k => {
      row.getCell(k).numFmt = '#,##0.00';
    });
  }

  ws.addRow([]);
  const totalRow = ws.addRow({
    desc: "TOTAL",
    amount: bills.reduce((s, b) => s + fmtAmt(b.amount), 0),
    paid: bills.reduce((s, b) => s + fmtAmt(b.paidAmount), 0),
    outstanding: bills.reduce((s, b) => s + fmtAmt(b.outstandingBalance), 0),
  });
  totalRow.font = { bold: true };
  ["amount", "paid", "outstanding"].forEach(k => { totalRow.getCell(k).numFmt = '#,##0.00'; });

  res.setHeader("Content-Disposition", `attachment; filename="fincommand-vendor-${vendor.name.replace(/\s+/g, "-").toLowerCase()}-${today()}.xlsx"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  await wb.xlsx.write(res);
  res.end();
}

async function sendVendorPdf(res: import("express").Response, vendor: typeof vendorsTable.$inferSelect, bills: (typeof billsTable.$inferSelect)[]) {
  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
  res.setHeader("Content-Disposition", `attachment; filename="fincommand-vendor-${vendor.name.replace(/\s+/g, "-").toLowerCase()}-${today()}.pdf"`);
  res.setHeader("Content-Type", "application/pdf");
  doc.pipe(res);

  doc.fontSize(18).font("Helvetica-Bold").text("FinCommand — Vendor Statement", { align: "center" });
  doc.fontSize(13).font("Helvetica").text(vendor.name, { align: "center" });
  doc.fontSize(9).fillColor("#666").text(`Generated: ${new Date().toLocaleString("en-NG")} · ${bills.length} transaction(s)`, { align: "center" });
  doc.moveDown();
  doc.fillColor("#000");

  const headers = ["Description", "Amount", "Paid", "Outstanding", "Status", "Due Date", "Submitted By"];
  const colWidths = [170, 90, 90, 90, 70, 80, 110];
  const startX = 40;
  let y = doc.y;

  doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), 18).fill("#1E3A5F");
  let x = startX;
  headers.forEach((h, i) => {
    doc.fillColor("#fff").font("Helvetica-Bold").fontSize(8).text(h, x + 3, y + 4, { width: colWidths[i]! - 6 });
    x += colWidths[i]!;
  });
  y += 18;

  for (let idx = 0; idx < bills.length; idx++) {
    const b = bills[idx]!;
    const bg = idx % 2 === 0 ? "#F7F9FC" : "#FFFFFF";
    const rowH = 16;
    doc.rect(startX, y, colWidths.reduce((a, v) => a + v, 0), rowH).fill(bg);
    x = startX;
    const cells = [
      b.description.slice(0, 50),
      formatCurrency(fmtAmt(b.amount)),
      formatCurrency(fmtAmt(b.paidAmount)),
      formatCurrency(fmtAmt(b.outstandingBalance)),
      (b.status ?? "").replace("_", " "),
      fmtDate(b.dueDate),
      b.createdByName,
    ];
    cells.forEach((cell, i) => {
      doc.fillColor("#111").font("Helvetica").fontSize(7.5).text(String(cell), x + 3, y + 3, { width: colWidths[i]! - 6, lineBreak: false });
      x += colWidths[i]!;
    });
    y += rowH;
    if (y > 540) { doc.addPage({ layout: "landscape" }); y = 40; }
  }

  doc.end();
}

// ─── Wallet statement export ──────────────────────────────────────────────

/**
 * GET /export/wallets/:id/statement
 * Export wallet transaction ledger as Excel or PDF.
 * Query: ?format=excel|pdf
 */
router.get("/export/wallets/:id/statement", async (req, res): Promise<void> => {
  const actor = req.user!;
  const walletId = req.params["id"];
  const format = (req.query["format"] as string) || "excel";

  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      logger.error({ userId: actor.id, walletId, format }, "Wallet statement export timed out");
      res.status(504).json({ error: "Export timed out. Please try again." });
    }
  }, EXPORT_TIMEOUT_MS);

  try {
    const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, walletId));
    if (!wallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }
    if (actor.role !== "md" && wallet.ownedBy !== actor.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const txns = await db.select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.walletId, walletId))
      .orderBy(desc(walletTransactionsTable.createdAt));

    auditLog("export.generated", {
      userId: actor.id,
      userRole: actor.role,
      ip: req.ip,
      resource: "wallet_statement",
      resourceId: walletId,
      details: { format, recordCount: txns.length, walletName: wallet.name },
    });

    if (format === "pdf") {
      await sendWalletPdf(res, wallet, txns);
    } else {
      await sendWalletExcel(res, wallet, txns);
    }
  } catch (err) {
    logger.error({ err, userId: actor.id, walletId, format }, "Wallet statement export failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "Export failed. Please try again or contact support." });
    }
  } finally {
    clearTimeout(timeoutId);
  }
});

async function sendWalletExcel(
  res: import("express").Response,
  wallet: typeof walletsTable.$inferSelect,
  txns: (typeof walletTransactionsTable.$inferSelect)[]
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FinCommand";
  const ws = wb.addWorksheet("Wallet Statement");

  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = `Wallet Statement — ${wallet.name}`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.addRow([]);

  ws.columns = [
    { header: "Date", key: "date", width: 18 },
    { header: "Type", key: "type", width: 20 },
    { header: "Description", key: "desc", width: 36 },
    { header: "Amount (NGN)", key: "amount", width: 18 },
    { header: "Balance Before", key: "before", width: 18 },
    { header: "Balance After", key: "after", width: 18 },
    { header: "Reference", key: "ref", width: 22 },
    { header: "Currency", key: "currency", width: 10 },
  ];
  applyHeaderStyle(ws.getRow(3), "FF1E3A5F");

  for (const tx of txns) {
    const amt = parseFloat(String(tx.amount));
    const row = ws.addRow({
      date: fmtDate(tx.createdAt),
      type: (tx.type ?? "").replace(/_/g, " "),
      desc: tx.narration ?? "",
      amount: amt,
      before: parseFloat(String(tx.balanceBefore)),
      after: parseFloat(String(tx.balanceAfter)),
      ref: tx.id,
      currency: "NGN",
    });
    ["amount", "before", "after"].forEach(k => { row.getCell(k).numFmt = '#,##0.00'; });
    if (tx.type === "credit" || tx.type === "transfer_in") {
      row.getCell("amount").font = { color: { argb: "FF16A34A" }, bold: true };
    } else {
      row.getCell("amount").font = { color: { argb: "FFB91C1C" }, bold: true };
    }
  }

  ws.addRow([]);
  const curBal = ws.addRow({ desc: "CURRENT BALANCE", after: parseFloat(String(wallet.balance ?? 0)) });
  curBal.font = { bold: true };
  curBal.getCell("after").numFmt = '#,##0.00';

  res.setHeader("Content-Disposition", `attachment; filename="fincommand-wallet-${wallet.name.replace(/\s+/g, "-").toLowerCase()}-${today()}.xlsx"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  await wb.xlsx.write(res);
  res.end();
}

async function sendWalletPdf(
  res: import("express").Response,
  wallet: typeof walletsTable.$inferSelect,
  txns: (typeof walletTransactionsTable.$inferSelect)[]
) {
  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
  res.setHeader("Content-Disposition", `attachment; filename="fincommand-wallet-${wallet.name.replace(/\s+/g, "-").toLowerCase()}-${today()}.pdf"`);
  res.setHeader("Content-Type", "application/pdf");
  doc.pipe(res);

  doc.fontSize(18).font("Helvetica-Bold").text("FinCommand — Wallet Statement", { align: "center" });
  doc.fontSize(13).font("Helvetica").text(wallet.name, { align: "center" });
  doc.fontSize(9).fillColor("#666").text(`Generated: ${new Date().toLocaleString("en-NG")} · Balance: ${formatCurrency(parseFloat(String(wallet.balance ?? 0)))}`, { align: "center" });
  doc.moveDown();
  doc.fillColor("#000");

  const headers = ["Date", "Type", "Description", "Amount", "Before", "After", "Currency"];
  const colWidths = [80, 90, 180, 90, 90, 90, 60];
  const startX = 40;
  let y = doc.y;

  doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), 18).fill("#1E3A5F");
  let x = startX;
  headers.forEach((h, i) => {
    doc.fillColor("#fff").font("Helvetica-Bold").fontSize(8).text(h, x + 3, y + 4, { width: colWidths[i]! - 6 });
    x += colWidths[i]!;
  });
  y += 18;

  for (let idx = 0; idx < txns.length; idx++) {
    const tx = txns[idx]!;
    const bg = idx % 2 === 0 ? "#F7F9FC" : "#FFFFFF";
    const rowH = 16;
    doc.rect(startX, y, colWidths.reduce((a, v) => a + v, 0), rowH).fill(bg);
    x = startX;
    const isCredit = tx.type === "credit" || tx.type === "transfer_in";
    const amt = parseFloat(String(tx.amount));
    const cells = [
      fmtDate(tx.createdAt),
      (tx.type ?? "").replace(/_/g, " "),
      (tx.narration ?? "").slice(0, 45),
      formatCurrency(amt),
      formatCurrency(parseFloat(String(tx.balanceBefore))),
      formatCurrency(parseFloat(String(tx.balanceAfter))),
      "NGN",
    ];
    cells.forEach((cell, i) => {
      const color = i === 3 ? (isCredit ? "#15803D" : "#B91C1C") : "#111";
      doc.fillColor(color).font(i === 3 ? "Helvetica-Bold" : "Helvetica").fontSize(7.5)
        .text(String(cell), x + 3, y + 3, { width: colWidths[i]! - 6, lineBreak: false });
      x += colWidths[i]!;
    });
    y += rowH;
    if (y > 540) { doc.addPage({ layout: "landscape" }); y = 40; }
  }

  doc.end();
}

export default router;
