import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, walletsTable, billsTable } from "@workspace/db";

const router: IRouter = Router();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function fmt(w: Record<string, unknown>) {
  return { ...w, balance: parseFloat(String(w["balance"] ?? 0)) };
}

router.get("/wallets", async (_req, res): Promise<void> => {
  const wallets = await db.select().from(walletsTable);
  res.json({ wallets: wallets.map(w => fmt(w as Record<string, unknown>)) });
});

router.post("/wallets", async (req, res): Promise<void> => {
  const { name, bankName, accountNumber, balance, currency } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const [wallet] = await db.insert(walletsTable).values({
    id: uid(), name, bankName, accountNumber,
    balance: String(balance ?? 0),
    currency: currency ?? "NGN",
  }).returning();
  res.status(201).json(fmt(wallet as Record<string, unknown>));
});

router.get("/wallets/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, rawId!));
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }
  const recentTransactions = await db.select().from(billsTable)
    .where(eq(billsTable.walletId, rawId!))
    .limit(20);
  res.json({ ...fmt(wallet as Record<string, unknown>), recentTransactions: recentTransactions.map(b => ({
    ...b,
    amount: parseFloat(String(b.amount)),
    paidAmount: parseFloat(String(b.paidAmount ?? 0)),
    outstandingBalance: parseFloat(String(b.outstandingBalance ?? 0)),
  })) });
});

router.patch("/wallets/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const { balance, name } = req.body;
  const updates: Record<string, unknown> = {};
  if (balance !== undefined) updates["balance"] = String(balance);
  if (name !== undefined) updates["name"] = name;
  const [wallet] = await db.update(walletsTable).set(updates).where(eq(walletsTable.id, rawId!)).returning();
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }
  res.json(fmt(wallet as Record<string, unknown>));
});

export default router;
