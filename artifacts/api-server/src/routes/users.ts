import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, walletsTable, billsTable } from "@workspace/db";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// Middleware: MD-only access
function requireMd(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== "md") {
    res.status(403).json({ error: "MD role required" });
    return;
  }
  next();
}

const safeUserColumns = {
  id: usersTable.id,
  name: usersTable.name,
  role: usersTable.role,
  email: usersTable.email,
  phone: usersTable.phone,
  isActive: usersTable.isActive,
  createdAt: usersTable.createdAt,
} as const;

// GET /users — MD-only: all users with per-user bill stats
router.get("/users", requireMd, async (_req, res): Promise<void> => {
  const users = await db.select(safeUserColumns).from(usersTable).orderBy(usersTable.createdAt);

  const bills = await db
    .select({
      createdBy: billsTable.createdBy,
      status: billsTable.status,
      amount: billsTable.amount,
      paidAmount: billsTable.paidAmount,
      outstandingBalance: billsTable.outstandingBalance,
    })
    .from(billsTable);

  type Stats = { total: number; pending: number; approved: number; totalAmount: number; paidAmount: number; outstandingAmount: number };
  const statsMap = new Map<string, Stats>();
  for (const bill of bills) {
    const s = statsMap.get(bill.createdBy) ?? { total: 0, pending: 0, approved: 0, totalAmount: 0, paidAmount: 0, outstandingAmount: 0 };
    s.total++;
    if (bill.status === "pending") s.pending++;
    if (bill.status === "approved") s.approved++;
    s.totalAmount += parseFloat(String(bill.amount ?? 0));
    s.paidAmount += parseFloat(String(bill.paidAmount ?? 0));
    s.outstandingAmount += parseFloat(String(bill.outstandingBalance ?? 0));
    statsMap.set(bill.createdBy, s);
  }

  const empty: Stats = { total: 0, pending: 0, approved: 0, totalAmount: 0, paidAmount: 0, outstandingAmount: 0 };
  const withStats = users.map(u => ({ ...u, billStats: statsMap.get(u.id) ?? empty }));

  res.json({ users: withStats });
});

// GET /users/:id — MD or self
router.get("/users/:id", async (req, res): Promise<void> => {
  const actor = req.user!;
  const id = req.params["id"] as string;
  if (actor.role !== "md" && actor.id !== id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const [user] = await db.select(safeUserColumns).from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

// GET /users/:id/profile — MD or self
router.get("/users/:id/profile", async (req, res): Promise<void> => {
  const actor = req.user!;
  const id = req.params["id"] as string;

  if (actor.role !== "md" && actor.id !== id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [user] = await db.select(safeUserColumns).from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const wallets = await db.select().from(walletsTable).where(eq(walletsTable.ownedBy, id));

  const bills = await db.select().from(billsTable).where(eq(billsTable.createdBy, id)).orderBy(billsTable.createdAt);

  const billStats = {
    total: bills.length,
    pending: bills.filter(b => b.status === "pending").length,
    approved: bills.filter(b => b.status === "approved").length,
    totalAmount: bills.reduce((s, b) => s + parseFloat(String(b.amount ?? 0)), 0),
    paidAmount: bills.reduce((s, b) => s + parseFloat(String(b.paidAmount ?? 0)), 0),
    outstandingAmount: bills.reduce((s, b) => s + parseFloat(String(b.outstandingBalance ?? 0)), 0),
  };

  const recentBills = bills.slice(-10).reverse().map(b => ({
    ...b,
    amount: parseFloat(String(b.amount)),
    paidAmount: parseFloat(String(b.paidAmount ?? 0)),
    outstandingBalance: parseFloat(String(b.outstandingBalance ?? 0)),
    approvedAmount: b.approvedAmount ? parseFloat(String(b.approvedAmount)) : undefined,
  }));

  const fmtWallets = wallets.map(w => ({
    ...w,
    balance: parseFloat(String(w.balance)),
    ownedByName: user.name,
  }));

  res.json({ ...user, wallets: fmtWallets, billStats, recentBills });
});

// POST /users — MD-only: create new users
router.post("/users", requireMd, async (req, res): Promise<void> => {
  const { name, role, email, phone, password } = req.body;
  if (!name || !role) { res.status(400).json({ error: "name and role are required" }); return; }
  if (!password) { res.status(400).json({ error: "password is required" }); return; }

  if (email) {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
    if (existing) { res.status(409).json({ error: "A user with this email already exists" }); return; }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [inserted] = await db
    .insert(usersTable)
    .values({ id: uid(), name, role, email, phone, passwordHash, isActive: true })
    .returning(safeUserColumns);
  res.status(201).json(inserted);
});

// PATCH /users/:id — MD-only: edit any user
router.patch("/users/:id", requireMd, async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const { name, role, email, phone, isActive, password } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates["name"] = name;
  if (role !== undefined) updates["role"] = role;
  if (email !== undefined) updates["email"] = email;
  if (phone !== undefined) updates["phone"] = phone;
  if (isActive !== undefined) updates["isActive"] = isActive;
  if (password) updates["passwordHash"] = await bcrypt.hash(password, 10);

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning(safeUserColumns);
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json(updated);
});

// DELETE /users/:id — MD-only: soft deactivate
router.delete("/users/:id", requireMd, async (req, res): Promise<void> => {
  const actor = req.user!;
  const id = req.params["id"] as string;

  if (actor.id === id) {
    res.status(400).json({ error: "Cannot deactivate your own account" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ isActive: false })
    .where(eq(usersTable.id, id))
    .returning({ id: usersTable.id });
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ success: true });
});

// DELETE /users/:id/permanent — MD-only: hard delete (no bills allowed)
router.delete("/users/:id/permanent", requireMd, async (req, res): Promise<void> => {
  const actor = req.user!;
  const id = req.params["id"] as string;

  if (actor.id === id) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  const [target] = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.role === "md") {
    res.status(400).json({ error: "Cannot delete an MD account" });
    return;
  }

  const [bill] = await db
    .select({ id: billsTable.id })
    .from(billsTable)
    .where(eq(billsTable.createdBy, id))
    .limit(1);
  if (bill) {
    res.status(409).json({ error: "Cannot delete user with existing bills — deactivate instead" });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.json({ success: true });
});

// POST /users/:id/reset-password — MD-only: set a new password for another user
router.post("/users/:id/reset-password", requireMd, async (req, res): Promise<void> => {
  const actor = req.user!;
  const id = req.params["id"] as string;
  const { password } = req.body as { password?: string };

  if (!password) { res.status(400).json({ error: "password is required" }); return; }
  if (actor.id === id) {
    res.status(400).json({ error: "Cannot reset your own password via this route" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.id, id))
    .returning(safeUserColumns);
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ success: true });
});

export default router;
