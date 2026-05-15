import { db } from "@workspace/db";
import {
  usersTable,
  vendorsTable,
  walletsTable,
  billsTable,
  notificationsTable,
  commentsTable,
  auditTable,
} from "@workspace/db";
import { logger } from "./logger";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export async function seedIfEmpty() {
  try {
    const existing = await db.select().from(usersTable).limit(1);
    if (existing.length > 0) return;

    logger.info("Seeding database with demo data...");

    const mdId = uid();
    const mrAId = uid();
    const mrBId = uid();
    const mrCId = uid();

    await db.insert(usersTable).values([
      { id: mdId, name: "MD — Chief Executive", role: "md", email: "md@fincommand.ng", phone: "+234 800 000 0001" },
      { id: mrAId, name: "Mr A (Treasury)", role: "treasury", email: "mra@fincommand.ng", phone: "+234 800 000 0002" },
      { id: mrBId, name: "Mr B (Payments)", role: "payment_assistant", email: "mrb@fincommand.ng", phone: "+234 800 000 0003" },
      { id: mrCId, name: "Mr C (Payments)", role: "payment_assistant", email: "mrc@fincommand.ng", phone: "+234 800 000 0004" },
    ]);

    const v1Id = uid(); const v2Id = uid(); const v3Id = uid();
    const v4Id = uid(); const v5Id = uid();
    await db.insert(vendorsTable).values([
      { id: v1Id, name: "Lucy Construction Ltd", phone: "+234 701 111 2222", totalBilled: "500000", totalPaid: "200000", outstandingBalance: "300000" },
      { id: v2Id, name: "Alpha Logistics & Supplies", phone: "+234 702 333 4444", bankName: "Zenith Bank", accountNumber: "0012345678", totalBilled: "1200000", totalPaid: "900000", outstandingBalance: "300000" },
      { id: v3Id, name: "TechFix Solutions", phone: "+234 703 555 6666", bankName: "GTB", accountNumber: "0087654321", totalBilled: "350000", totalPaid: "350000", outstandingBalance: "0" },
      { id: v4Id, name: "Crest Cleaning Services", phone: "+234 704 777 8888", totalBilled: "180000", totalPaid: "60000", outstandingBalance: "120000" },
      { id: v5Id, name: "Metro Security Agency", phone: "+234 705 999 0000", bankName: "First Bank", accountNumber: "3034567890", totalBilled: "240000", totalPaid: "120000", outstandingBalance: "120000" },
    ]);

    const w1Id = uid(); const w2Id = uid(); const w3Id = uid();
    await db.insert(walletsTable).values([
      { id: w1Id, name: "Zenith Bank Main", bankName: "Zenith Bank", accountNumber: "1234567890", balance: "5420000", currency: "NGN", isLow: false },
      { id: w2Id, name: "GTB Operations", bankName: "GTB", accountNumber: "0987654321", balance: "820000", currency: "NGN", isLow: false },
      { id: w3Id, name: "First Bank Petty Cash", bankName: "First Bank", accountNumber: "3012345678", balance: "45000", currency: "NGN", isLow: true },
    ]);

    const today = new Date().toISOString().split("T")[0]!;
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0]!;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]!;
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString().split("T")[0]!;

    const b1Id = uid(); const b2Id = uid(); const b3Id = uid();
    const b4Id = uid(); const b5Id = uid(); const b6Id = uid();
    const b7Id = uid(); const b8Id = uid();

    await db.insert(billsTable).values([
      { id: b1Id, vendorId: v1Id, vendorName: "Lucy Construction Ltd", description: "Loading and offloading materials at Lekki site", amount: "100000", paidAmount: "0", outstandingBalance: "100000", scheduledDate: today, walletId: w1Id, walletName: "Zenith Bank Main", priority: "high", status: "pending", createdBy: mrAId, createdByName: "Mr A (Treasury)", hasAttachment: true },
      { id: b2Id, vendorId: v1Id, vendorName: "Lucy Construction Ltd", description: "Heavy equipment transport — batch 2", amount: "100000", paidAmount: "0", outstandingBalance: "100000", scheduledDate: tomorrow, walletId: w1Id, walletName: "Zenith Bank Main", priority: "medium", status: "pending", createdBy: mrAId, createdByName: "Mr A (Treasury)" },
      { id: b3Id, vendorId: v2Id, vendorName: "Alpha Logistics & Supplies", description: "Office stationery and consumables — July batch", amount: "85000", paidAmount: "0", outstandingBalance: "85000", scheduledDate: today, walletId: w2Id, walletName: "GTB Operations", priority: "urgent", status: "pending", createdBy: mrBId, createdByName: "Mr B (Payments)", hasAttachment: true },
      { id: b4Id, vendorId: v4Id, vendorName: "Crest Cleaning Services", description: "Monthly cleaning contract — Head Office", amount: "60000", paidAmount: "0", outstandingBalance: "60000", scheduledDate: today, walletId: w2Id, walletName: "GTB Operations", priority: "medium", status: "approved", createdBy: mrCId, createdByName: "Mr C (Payments)" },
      { id: b5Id, vendorId: v5Id, vendorName: "Metro Security Agency", description: "Security services — Month of June", amount: "120000", paidAmount: "50000", outstandingBalance: "70000", scheduledDate: yesterday, dueDate: tenDaysAgo, priority: "urgent", status: "overdue", createdBy: mrBId, createdByName: "Mr B (Payments)", hasAttachment: true, overdueDays: 10 },
      { id: b6Id, vendorId: v2Id, vendorName: "Alpha Logistics & Supplies", description: "Diesel supply for generators — emergency restock", amount: "200000", paidAmount: "200000", outstandingBalance: "0", scheduledDate: yesterday, walletId: w1Id, walletName: "Zenith Bank Main", priority: "urgent", status: "paid", createdBy: mrAId, createdByName: "Mr A (Treasury)" },
      { id: b7Id, vendorId: v3Id, vendorName: "TechFix Solutions", description: "Server maintenance and software licenses", amount: "150000", paidAmount: "75000", outstandingBalance: "75000", scheduledDate: tomorrow, walletId: w1Id, walletName: "Zenith Bank Main", priority: "high", status: "partial", createdBy: mrAId, createdByName: "Mr A (Treasury)", hasAttachment: true },
      { id: b8Id, vendorId: v4Id, vendorName: "Crest Cleaning Services", description: "Deep cleaning — conference rooms and executive floor", amount: "35000", paidAmount: "0", outstandingBalance: "35000", scheduledDate: tomorrow, walletId: w3Id, walletName: "First Bank Petty Cash", priority: "low", status: "pending", createdBy: mrCId, createdByName: "Mr C (Payments)" },
    ]);

    await db.insert(commentsTable).values([
      { id: uid(), billId: b1Id, authorId: mdId, authorName: "MD — Chief Executive", authorRole: "md", text: "Pay ₦50,000 first. Confirm the invoice before full payment." },
      { id: uid(), billId: b3Id, authorId: mdId, authorName: "MD — Chief Executive", authorRole: "md", text: "Use Zenith wallet. Why is this amount higher than last month?" },
      { id: uid(), billId: b5Id, authorId: mdId, authorName: "MD — Chief Executive", authorRole: "md", text: "This is overdue. Escalate and pay immediately from Zenith Main." },
    ]);

    await db.insert(notificationsTable).values([
      { id: uid(), userId: mrAId, type: "comment_added", title: "MD commented on your payment", body: "Pay ₦50,000 first. Confirm the invoice before full payment.", billId: b1Id },
      { id: uid(), userId: mrBId, type: "comment_added", title: "MD commented on your payment", body: "Use Zenith wallet. Why is this amount higher than last month?", billId: b3Id },
      { id: uid(), userId: mrBId, type: "overdue_warning", title: "Overdue payment alert", body: "Metro Security Agency bill is 10 days overdue.", billId: b5Id },
      { id: uid(), userId: mrCId, type: "wallet_low", title: "Wallet balance low", body: "First Bank Petty Cash balance is critically low at ₦45,000.", billId: null },
    ]);

    await db.insert(auditTable).values([
      { id: uid(), billId: b1Id, userId: mrAId, userName: "Mr A (Treasury)", action: "created", details: "Bill created for Lucy Construction Ltd" },
      { id: uid(), billId: b3Id, userId: mrBId, userName: "Mr B (Payments)", action: "created", details: "Bill created for Alpha Logistics & Supplies" },
      { id: uid(), billId: b4Id, userId: mdId, userName: "MD — Chief Executive", action: "approved", details: "Bill approved for full amount" },
      { id: uid(), billId: b6Id, userId: mdId, userName: "MD — Chief Executive", action: "approved", details: "Urgent diesel restocking approved" },
      { id: uid(), billId: b6Id, userId: mrAId, userName: "Mr A (Treasury)", action: "paid", details: "Full payment processed via Zenith Bank Main" },
      { id: uid(), billId: b7Id, userId: mdId, userName: "MD — Chief Executive", action: "partial_approved", details: "Partial approval: ₦75,000 of ₦150,000", oldValue: "150000", newValue: "75000" },
    ]);

    logger.info("Seeding complete.");
  } catch (err) {
    logger.error({ err }, "Seeding failed");
  }
}
