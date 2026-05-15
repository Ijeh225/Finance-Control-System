import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, walletsTable, billsTable } from "@workspace/db";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
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

router.get("/users", async (_req, res): Promise<void> => {
  const users = await db.select(safeUserColumns).from(usersTable).orderBy(usersTable.createdAt);
  res.json({ users });
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const [user] = await db.select(safeUserColumns).from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

router.get("/users/:id/profile", async (req, res): Promise<void> => {
  const id = req.params["id"] as string;

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

router.post("/users", async (req, res): Promise<void> => {
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

router.patch("/users/:id", async (req, res): Promise<void> => {
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

router.delete("/users/:id", async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const [updated] = await db
    .update(usersTable)
    .set({ isActive: false })
    .where(eq(usersTable.id, id))
    .returning({ id: usersTable.id });
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ success: true });
});

export default router;
