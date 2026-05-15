import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/notifications", async (req, res): Promise<void> => {
  const actor = req.user!;
  // MD can request any userId; non-MD is always scoped to their own id
  const requestedUserId = req.query["userId"] as string | undefined;
  const userId = actor.role === "md" ? (requestedUserId ?? actor.id) : actor.id;

  const { unreadOnly } = req.query as Record<string, string>;
  const conditions: ReturnType<typeof eq>[] = [eq(notificationsTable.userId, userId)];
  if (unreadOnly === "true") conditions.push(eq(notificationsTable.isRead, false));
  const notifications = await db.select().from(notificationsTable).where(and(...conditions));
  const unreadCount = notifications.filter(n => !n.isRead).length;
  res.json({ notifications, unreadCount });
});

router.post("/notifications/:id/read", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const [notification] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.id, rawId!))
    .returning();
  if (!notification) { res.status(404).json({ error: "Notification not found" }); return; }
  res.json(notification);
});

router.post("/notifications/read-all", async (req, res): Promise<void> => {
  const actor = req.user!;
  // Always mark-all-read for the calling user only
  const updated = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.userId, actor.id), eq(notificationsTable.isRead, false)))
    .returning();
  res.json({ updated: updated.length });
});

export default router;
