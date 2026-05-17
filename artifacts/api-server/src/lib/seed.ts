import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { logger } from "./logger";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/**
 * Ensures the MD account exists on startup. Nothing else is seeded.
 * All vendors, wallets, and bills are created by the user through the app.
 */
export async function seedIfEmpty() {
  try {
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
