import { eq, inArray, not } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, billsTable, vendorsTable, walletsTable, auditTable, notificationsTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { logger } from "./logger";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/**
 * Removes any leftover demo data (demo PA user and all seeded records).
 * Safe to call repeatedly — does nothing if demo data is already gone.
 */
async function wipeDemoData() {
  // Remove the demo PA account by its known email
  const [demoUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, "mra@fincommand.ng"))
    .limit(1);

  if (!demoUser) return; // already clean

  logger.info("Demo data detected — wiping now...");

  const demoId = demoUser.id;

  // Find all bills created by or paid by the demo user
  const demoBills = await db
    .select({ id: billsTable.id })
    .from(billsTable)
    .where(eq(billsTable.createdBy, demoId));

  const demoBillIds = demoBills.map(b => b.id);

  if (demoBillIds.length > 0) {
    await db.delete(auditTable).where(inArray(auditTable.billId, demoBillIds));
    await db.delete(notificationsTable).where(inArray(notificationsTable.billId, demoBillIds));
    await db.delete(billsTable).where(inArray(billsTable.id, demoBillIds));
  }

  // Remove any audit/notification rows directly owned by the demo user (no billId)
  await db.delete(auditTable).where(eq(auditTable.userId, demoId));
  await db.delete(notificationsTable).where(eq(notificationsTable.userId, demoId));

  // Remove the demo user
  await db.delete(usersTable).where(eq(usersTable.id, demoId));

  // Remove vendors that have no remaining bills
  const activeVendorIds = (
    await db.select({ vendorId: billsTable.vendorId }).from(billsTable)
  ).map(r => r.vendorId).filter(Boolean) as string[];

  if (activeVendorIds.length > 0) {
    await db.delete(vendorsTable).where(not(inArray(vendorsTable.id, activeVendorIds)));
  } else {
    await db.delete(vendorsTable);
  }

  // Remove wallets that have no remaining bills
  const activeWalletIds = (
    await db.select({ walletId: billsTable.walletId }).from(billsTable)
  ).map(r => r.walletId).filter(Boolean) as string[];

  if (activeWalletIds.length > 0) {
    await db.delete(walletsTable).where(not(inArray(walletsTable.id, activeWalletIds)));
  } else {
    await db.delete(walletsTable);
  }

  logger.info("Demo data wiped successfully.");
}

/**
 * Ensures the MD account exists on startup. Nothing else is seeded.
 * All vendors, wallets, and bills are created by the user through the app.
 */
export async function seedIfEmpty() {
  try {
    // Always run demo cleanup first (removes Asst A + seeded data if present)
    await wipeDemoData();

    const [md] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, "md@fincommand.ng"))
      .limit(1);

    if (!md) {
      const passwordHash = await bcrypt.hash("FinCommand2026!", 10);
      await db.insert(usersTable).values({
        id: uid(),
        name: "MD — Chief Executive",
        role: "md",
        email: "md@fincommand.ng",
        phone: "+234 800 000 0001",
        passwordHash,
        isActive: true,
      });
      logger.info("MD account created.");
    } else if (!md.passwordHash) {
      const passwordHash = await bcrypt.hash("FinCommand2026!", 10);
      await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, md.id));
      logger.info("MD password hash backfilled.");
    }
  } catch (err) {
    logger.error({ err }, "seedIfEmpty failed");
  }
}
