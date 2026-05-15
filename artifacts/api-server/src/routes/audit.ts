import { Router, type IRouter } from "express";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, auditTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/audit", async (req, res): Promise<void> => {
  const actor = req.user!;
  const { userId, billId, action, from, to } = req.query as Record<string, string>;
  const limit = parseInt(String(req.query["limit"] ?? "50"));
  const conditions: ReturnType<typeof eq>[] = [];

  // Non-MD users can only see audit entries they personally performed
  if (actor.role !== "md") {
    conditions.push(eq(auditTable.userId, actor.id));
  } else if (userId) {
    // MD can optionally filter by a specific user
    conditions.push(eq(auditTable.userId, userId));
  }

  if (billId) conditions.push(eq(auditTable.billId, billId));
  if (action) conditions.push(eq(auditTable.action, action));
  if (from) conditions.push(gte(auditTable.createdAt, new Date(from)));
  if (to) conditions.push(lte(auditTable.createdAt, new Date(to)));

  const entries = await db.select().from(auditTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${auditTable.createdAt} desc`)
    .limit(limit);

  res.json({ entries, total: entries.length });
});

export default router;
