import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable, vendorsTable, walletsTable, billsTable, auditTable,
} from "@workspace/db";
import bcrypt from "bcryptjs";
import { logger } from "./logger";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/** Returns a Date for N days before now */
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

/** Returns a YYYY-MM-DD string for N days before now */
function dateStr(n: number): string {
  return daysAgo(n).toISOString().split("T")[0]!;
}

/**
 * Ensures the MD account and payment-assistant demo account exist.
 * On a fresh database also seeds vendors, wallets, and a realistic set of
 * bills (paid, partial, pending, approved, overdue) so every dashboard
 * card and the Payment History page show live data from day one.
 *
 * Idempotent: skips vendor/wallet/bill seeding if any vendors already exist.
 */
export async function seedIfEmpty() {
  try {
    // ── 1. MD account ────────────────────────────────────────────────────────
    const [md] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, "md@fincommand.ng"))
      .limit(1);

    let mdId: string;
    if (!md) {
      mdId = uid();
      const passwordHash = await bcrypt.hash("FinCommand2026!", 10);
      await db.insert(usersTable).values({
        id: mdId,
        name: "MD — Chief Executive",
        role: "md",
        email: "md@fincommand.ng",
        phone: "+234 800 000 0001",
        passwordHash,
        isActive: true,
      });
      logger.info("MD account created.");
    } else {
      mdId = md.id;
      if (!md.passwordHash) {
        const passwordHash = await bcrypt.hash("FinCommand2026!", 10);
        await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, md.id));
        logger.info("MD password hash backfilled.");
      }
    }

    // ── 2. Payment-assistant demo account ────────────────────────────────────
    const [pa] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, "mra@fincommand.ng"))
      .limit(1);

    let paId: string;
    let paName: string;
    if (!pa) {
      paId = uid();
      paName = "Asst A";
      const passwordHash = await bcrypt.hash("MrA@2026", 10);
      await db.insert(usersTable).values({
        id: paId,
        name: paName,
        role: "payment_assistant",
        email: "mra@fincommand.ng",
        phone: "+234 800 000 0002",
        passwordHash,
        isActive: true,
      });
      logger.info("Payment assistant account created.");
    } else {
      paId = pa.id;
      paName = pa.name;
    }

    // ── 3. Bail out early if vendors already exist (idempotency guard) ────────
    const [{ vendorCount }] = await db
      .select({ vendorCount: sql<number>`count(*)::int` })
      .from(vendorsTable);
    if (vendorCount > 0) {
      logger.info("Seed: vendors already exist, skipping demo data.");
      return;
    }

    logger.info("Seed: fresh database detected — inserting demo data...");

    // ── 4. Vendors ────────────────────────────────────────────────────────────
    const vKena    = uid();
    const vFaith   = uid();
    const vLucy    = uid();
    const vBuild   = uid();

    // ── 5. Wallets ────────────────────────────────────────────────────────────
    const wGTB  = uid();
    const wZen  = uid();

    await db.insert(walletsTable).values([
      {
        id: wGTB,
        name: "GTBank Operations",
        bankName: "Guaranty Trust Bank",
        accountNumber: "0123456789",
        balance: "14250000.00",
        currency: "NGN",
      },
      {
        id: wZen,
        name: "Zenith Treasury",
        bankName: "Zenith Bank",
        accountNumber: "9876543210",
        balance: "8175000.00",
        currency: "NGN",
      },
    ]);
    logger.info("Wallets seeded.");

    // ── 6. Bills ──────────────────────────────────────────────────────────────
    // Helpers
    const paid = (
      id: string,
      vendorId: string,
      vendorName: string,
      desc: string,
      amount: string,
      daysAgoPaid: number,
      priority: "low" | "medium" | "high" | "urgent" = "medium",
    ) => ({
      id,
      vendorId,
      vendorName,
      description: desc,
      amount,
      approvedAmount: amount,
      paidAmount: amount,
      outstandingBalance: "0.00",
      scheduledDate: dateStr(daysAgoPaid + 2),
      walletId: wGTB,
      walletName: "GTBank Operations",
      priority,
      status: "paid" as const,
      createdBy: paId,
      createdByName: paName,
      paidBy: paId,
      paidByName: paName,
      paidAt: daysAgo(daysAgoPaid),
      paymentReference: `REF-${id.toUpperCase().slice(-6)}`,
      paidWalletId: wGTB,
      paidWalletName: "GTBank Operations",
    });

    // Paid bills – spread across the last 30 days for an interesting chart
    const b1  = uid(); // Kena
    const b2  = uid();
    const b3  = uid();
    const b4  = uid();
    const b5  = uid(); // Faith
    const b6  = uid();
    const b7  = uid(); // Lucy
    const b8  = uid(); // BuildRight
    const b9  = uid();
    // Partial bills
    const b10 = uid(); // Faith partial
    const b11 = uid(); // BuildRight partial
    // Pending
    const b12 = uid(); // Kena pending
    const b13 = uid(); // Lucy pending
    const b14 = uid(); // Faith pending
    // Approved
    const b15 = uid(); // Lucy approved
    // Overdue
    const b16 = uid(); // BuildRight overdue

    await db.insert(billsTable).values([
      // ── Kena Tech Solutions ──────────────────────────────────────────────
      paid(b1, vKena, "Kena Tech Solutions", "Monthly IT Support — Apr", "150000.00", 2, "high"),
      paid(b2, vKena, "Kena Tech Solutions", "Server Hosting Q1", "220000.00", 6, "medium"),
      paid(b3, vKena, "Kena Tech Solutions", "Network Infrastructure Setup", "85000.00", 13, "low"),
      paid(b4, vKena, "Kena Tech Solutions", "Software License Renewal", "340000.00", 21, "medium"),
      // ── Faith Properties ─────────────────────────────────────────────────
      paid(b5, vFaith, "Faith Properties", "Office Rent — March", "500000.00", 9, "high"),
      paid(b6, vFaith, "Faith Properties", "Office Utilities — March", "75000.00", 16, "low"),
      // ── Lucy Cleaning Services ───────────────────────────────────────────
      paid(b7, vLucy, "Lucy Cleaning Services", "Janitorial Services — April", "45000.00", 3, "low"),
      // ── BuildRight Construction ──────────────────────────────────────────
      paid(b8, vBuild, "BuildRight Construction", "Office Renovation Phase 1", "1200000.00", 26, "urgent"),
      paid(b9, vBuild, "BuildRight Construction", "Generator Installation", "380000.00", 19, "high"),
      // ── Faith Properties — partial ───────────────────────────────────────
      {
        id: b10,
        vendorId: vFaith,
        vendorName: "Faith Properties",
        description: "Office Lease Renewal 2026",
        amount: "1500000.00",
        approvedAmount: "750000.00",
        paidAmount: "750000.00",
        outstandingBalance: "750000.00",
        scheduledDate: dateStr(5),
        walletId: wGTB,
        walletName: "GTBank Operations",
        priority: "urgent" as const,
        status: "partial" as const,
        createdBy: paId,
        createdByName: paName,
        paidBy: paId,
        paidByName: paName,
        paidAt: daysAgo(4),
        paymentReference: `REF-${b10.toUpperCase().slice(-6)}`,
        paidWalletId: wGTB,
        paidWalletName: "GTBank Operations",
      },
      // ── BuildRight Construction — partial ────────────────────────────────
      {
        id: b11,
        vendorId: vBuild,
        vendorName: "BuildRight Construction",
        description: "Office Renovation Phase 2",
        amount: "800000.00",
        approvedAmount: "400000.00",
        paidAmount: "400000.00",
        outstandingBalance: "400000.00",
        scheduledDate: dateStr(3),
        walletId: wGTB,
        walletName: "GTBank Operations",
        priority: "high" as const,
        status: "partial" as const,
        createdBy: paId,
        createdByName: paName,
        paidBy: paId,
        paidByName: paName,
        paidAt: daysAgo(2),
        paymentReference: `REF-${b11.toUpperCase().slice(-6)}`,
        paidWalletId: wGTB,
        paidWalletName: "GTBank Operations",
      },
      // ── Pending bills ────────────────────────────────────────────────────
      {
        id: b12,
        vendorId: vKena,
        vendorName: "Kena Tech Solutions",
        description: "Annual Software Renewal — 2026",
        amount: "280000.00",
        paidAmount: "0.00",
        outstandingBalance: "280000.00",
        scheduledDate: dateStr(-3),
        priority: "medium" as const,
        status: "pending" as const,
        createdBy: paId,
        createdByName: paName,
      },
      {
        id: b13,
        vendorId: vLucy,
        vendorName: "Lucy Cleaning Services",
        description: "Deep Cleaning — Q2 2026",
        amount: "90000.00",
        paidAmount: "0.00",
        outstandingBalance: "90000.00",
        scheduledDate: dateStr(-5),
        priority: "low" as const,
        status: "pending" as const,
        createdBy: paId,
        createdByName: paName,
      },
      {
        id: b14,
        vendorId: vFaith,
        vendorName: "Faith Properties",
        description: "Office Expansion — Annex B",
        amount: "250000.00",
        paidAmount: "0.00",
        outstandingBalance: "250000.00",
        scheduledDate: dateStr(-7),
        priority: "medium" as const,
        status: "pending" as const,
        createdBy: paId,
        createdByName: paName,
      },
      // ── Approved (ready to pay) ───────────────────────────────────────────
      {
        id: b15,
        vendorId: vLucy,
        vendorName: "Lucy Cleaning Services",
        description: "Security & Reception Services — May",
        amount: "120000.00",
        approvedAmount: "120000.00",
        paidAmount: "0.00",
        outstandingBalance: "120000.00",
        scheduledDate: dateStr(-1),
        walletId: wZen,
        walletName: "Zenith Treasury",
        priority: "medium" as const,
        status: "approved" as const,
        createdBy: paId,
        createdByName: paName,
      },
      // ── Overdue ──────────────────────────────────────────────────────────
      {
        id: b16,
        vendorId: vBuild,
        vendorName: "BuildRight Construction",
        description: "Emergency AC Repair — Block C",
        amount: "175000.00",
        paidAmount: "0.00",
        outstandingBalance: "175000.00",
        scheduledDate: dateStr(6),
        priority: "urgent" as const,
        status: "overdue" as const,
        createdBy: paId,
        createdByName: paName,
        overdueDays: 6,
      },
    ]);
    logger.info("Bills seeded.");

    // ── 7. Vendors (totals computed from bills above) ─────────────────────────
    await db.insert(vendorsTable).values([
      {
        id: vKena,
        name: "Kena Tech Solutions",
        email: "accounts@kenatechng.com",
        phone: "+234 803 111 2233",
        bankName: "Access Bank",
        accountNumber: "0011223344",
        // b1+b2+b3+b4+b12 = 150k+220k+85k+340k+280k = 1,075,000
        totalBilled: "1075000.00",
        // b1+b2+b3+b4 paid
        totalPaid: "795000.00",
        // b12 pending
        outstandingBalance: "280000.00",
      },
      {
        id: vFaith,
        name: "Faith Properties",
        email: "billing@faithproperties.ng",
        phone: "+234 802 444 5566",
        bankName: "First Bank",
        accountNumber: "3344556677",
        // b5+b6+b10+b14 = 500k+75k+1500k+250k = 2,325,000
        totalBilled: "2325000.00",
        // b5+b6 paid (575k) + b10 paidAmount (750k) = 1,325,000
        totalPaid: "1325000.00",
        // b10 remaining (750k) + b14 pending (250k) = 1,000,000
        outstandingBalance: "1000000.00",
        lastPaymentDate: daysAgo(4),
      },
      {
        id: vLucy,
        name: "Lucy Cleaning Services",
        email: "lucy@lucyclean.ng",
        phone: "+234 706 777 8899",
        bankName: "UBA",
        accountNumber: "2233445566",
        // b7+b13+b15 = 45k+90k+120k = 255,000
        totalBilled: "255000.00",
        // b7 paid
        totalPaid: "45000.00",
        // b13 pending + b15 approved = 210,000
        outstandingBalance: "210000.00",
        lastPaymentDate: daysAgo(3),
      },
      {
        id: vBuild,
        name: "BuildRight Construction",
        email: "finance@buildrightng.com",
        phone: "+234 805 999 0011",
        bankName: "Zenith Bank",
        accountNumber: "5566778899",
        // b8+b9+b11+b16 = 1200k+380k+800k+175k = 2,555,000
        totalBilled: "2555000.00",
        // b8+b9 paid (1580k) + b11 paidAmount (400k) = 1,980,000
        totalPaid: "1980000.00",
        // b11 remaining (400k) + b16 overdue (175k) = 575,000
        outstandingBalance: "575000.00",
        lastPaymentDate: daysAgo(2),
      },
    ]);
    logger.info("Vendors seeded.");

    // ── 8. Audit trail for paid bills ────────────────────────────────────────
    const paidBillIds = [b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11];
    const auditRows = paidBillIds.map(billId => ({
      id: uid(),
      billId,
      userId: mdId,
      userName: "MD — Chief Executive",
      action: "approve",
      details: "Approved for payment",
    }));
    const payRows = [b1, b2, b3, b4, b5, b6, b7, b8, b9].map(billId => ({
      id: uid(),
      billId,
      userId: paId,
      userName: paName,
      action: "pay",
      details: "Payment processed",
    }));
    await db.insert(auditTable).values([...auditRows, ...payRows]);
    logger.info("Audit trail seeded.");

    logger.info("Seed complete — vendors, wallets, bills, and audit trail ready.");
  } catch (err) {
    logger.error({ err }, "seedIfEmpty failed");
  }
}
