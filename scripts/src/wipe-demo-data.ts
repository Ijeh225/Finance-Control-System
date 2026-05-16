/**
 * wipe-demo-data.ts
 *
 * One-time script: deletes all demo data and keeps only the MD account.
 * Safe to re-run — it is idempotent: if the data is already gone, it does nothing harmful.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run wipe-demo-data
 *
 * What it does (in FK-safe order):
 *   1. Deletes all sessions
 *   2. Deletes all notifications
 *   3. Deletes all audit_entries
 *   4. Deletes all comments
 *   5. Deletes all bill_attachments
 *   6. Deletes all bills
 *   7. Deletes all wallet_transactions
 *   8. Deletes all wallets
 *   9. Deletes all vendors
 *  10. Deletes all non-MD users (role != 'md')
 */

import { ne } from "drizzle-orm";
import {
  db,
  usersTable,
  vendorsTable,
  walletsTable,
  walletTransactionsTable,
  billsTable,
  notificationsTable,
  commentsTable,
  auditTable,
  sessionsTable,
  billAttachmentsTable,
} from "@workspace/db";

async function wipeDemoData() {
  console.log("Starting demo data wipe...");

  const del = async (label: string, promise: Promise<unknown>) => {
    const result = await promise;
    console.log(`  ✓ Deleted ${label}`);
    return result;
  };

  await del("sessions", db.delete(sessionsTable));
  await del("notifications", db.delete(notificationsTable));
  await del("audit entries", db.delete(auditTable));
  await del("comments", db.delete(commentsTable));
  await del("bill attachments", db.delete(billAttachmentsTable));
  await del("bills", db.delete(billsTable));
  await del("wallet transactions", db.delete(walletTransactionsTable));
  await del("wallets", db.delete(walletsTable));
  await del("vendors", db.delete(vendorsTable));
  await del("non-MD users", db.delete(usersTable).where(ne(usersTable.role, "md")));

  const remaining = await db.select({ role: usersTable.role, email: usersTable.email }).from(usersTable);
  console.log("\nRemaining users:", remaining);
  console.log("\nDemo data wipe complete. System is ready for real use.");

  process.exit(0);
}

wipeDemoData().catch(err => {
  console.error("Wipe failed:", err);
  process.exit(1);
});
