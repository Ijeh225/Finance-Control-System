import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, walletsTable, billsTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function fmtWallet(w: typeof walletsTable.$inferSelect, ownerName?: string) {
  return {
    ...w,
    balance: parseFloat(String(w.balance ?? 0)),
    ownedByName: ownerName,
  };
}

router.get("/wallets", async (req, res): Promise<void> => {
  const actor = req.user!;
  const requestedUserId = req.query["userId"] as string | undefined;

  // Non-MD users: scoped to their own wallets only (ignore userId param)
  // MD: optionally filter by userId, or see all
  const ownedBy = actor.role !== "md"
    ? actor.id
    : requestedUserId ?? undefined;

  const wallets = ownedBy
    ? await db.select().from(walletsTable).where(eq(walletsTable.ownedBy, ownedBy))
    : await db.select().from(walletsTable);

  // Attach owner names in bulk
  const ownerIds = [...new Set(wallets.map(w => w.ownedBy).filter(Boolean))] as string[];
  const owners = ownerIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
    : [];
  const ownerMap: Record<string, string> = Object.fromEntries(owners.map(o => [o.id, o.name]));

  res.json({ wallets: wallets.map(w => fmtWallet(w, w.ownedBy ? ownerMap[w.ownedBy] : undefined)) });
});

router.post("/wallets", async (req, res): Promise<void> => {
  const actor = req.user!;
  const { name, bankName, accountNumber, balance, currency, ownedBy: bodyOwnedBy } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  // MD can assign to any user; everyone else always owns the wallet themselves
  const ownedBy = actor.role === "md" && bodyOwnedBy ? bodyOwnedBy : actor.id;

  const [wallet] = await db.insert(walletsTable).values({
    id: uid(),
    name,
    bankName: bankName ?? null,
    accountNumber: accountNumber ?? null,
    balance: String(balance ?? 0),
    currency: currency ?? "NGN",
    ownedBy,
  }).returning();

  let ownerName: string | undefined;
  if (wallet.ownedBy) {
    const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, wallet.ownedBy));
    ownerName = owner?.name;
  }

  res.status(201).json(fmtWallet(wallet, ownerName));
});

router.get("/wallets/:id", async (req, res): Promise<void> => {
  const actor = req.user!;
  const id = req.params["id"] as string;

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, id));
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

  // Non-MD can only access their own wallet; null-owned wallets are also denied
  if (actor.role !== "md" && wallet.ownedBy !== actor.id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const recentTransactions = await db.select().from(billsTable)
    .where(eq(billsTable.walletId, id))
    .limit(20);

  let ownerName: string | undefined;
  if (wallet.ownedBy) {
    const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, wallet.ownedBy));
    ownerName = owner?.name;
  }

  res.json({
    ...fmtWallet(wallet, ownerName),
    recentTransactions: recentTransactions.map(b => ({
      ...b,
      amount: parseFloat(String(b.amount)),
      paidAmount: parseFloat(String(b.paidAmount ?? 0)),
      outstandingBalance: parseFloat(String(b.outstandingBalance ?? 0)),
    })),
  });
});

router.patch("/wallets/:id", async (req, res): Promise<void> => {
  const actor = req.user!;
  const id = req.params["id"] as string;
  const { balance, name, bankName, accountNumber, currency, ownedBy } = req.body;

  const [existing] = await db.select({ ownedBy: walletsTable.ownedBy }).from(walletsTable).where(eq(walletsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Wallet not found" }); return; }

  // Non-MD can only update their own wallet
  if (actor.role !== "md" && existing.ownedBy !== actor.id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (balance !== undefined) updates["balance"] = String(balance);
  if (name !== undefined) updates["name"] = name;
  if (bankName !== undefined) updates["bankName"] = bankName;
  if (accountNumber !== undefined) updates["accountNumber"] = accountNumber;
  if (currency !== undefined) updates["currency"] = currency;
  // Only MD can reassign wallet ownership
  if (ownedBy !== undefined && actor.role === "md") updates["ownedBy"] = ownedBy;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [wallet] = await db.update(walletsTable).set(updates).where(eq(walletsTable.id, id)).returning();
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

  let ownerName: string | undefined;
  if (wallet.ownedBy) {
    const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, wallet.ownedBy));
    ownerName = owner?.name;
  }

  res.json(fmtWallet(wallet, ownerName));
});

export default router;
