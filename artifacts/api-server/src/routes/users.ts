import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

const router: IRouter = Router();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

router.get("/users", async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable);
  res.json({ users });
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, rawId!));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

router.post("/users", async (req, res): Promise<void> => {
  const { name, role, email, phone } = req.body;
  if (!name || !role) { res.status(400).json({ error: "name and role are required" }); return; }
  const [user] = await db.insert(usersTable).values({ id: uid(), name, role, email, phone }).returning();
  res.status(201).json(user);
});

export default router;
