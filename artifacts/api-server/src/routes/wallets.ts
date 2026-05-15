import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, walletsTable, billsTable, usersTable } from "@workspace/db";
import type { Request } from "express";

const router: IRouter = Router();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function fmt(w: Record<string, unknown>, ownerName?: string) {
  return {
    ...w,
    balance: parseFloat(String(w["balance"] ?? 0)),
    ownedByName: ownerName ?? undefined,
  };
}

router.get("/wallets", async (req: Request, res): Promise<void> => {
  const user = (req as any).user as { id: string; role: string } | undefined;
  const requestedUserId = req.query["userId"] as string | undefined;

  let ownedBy: string | undefined;
  if (user?.role !== "md") {
    ownedBy = user?.id;
  } else if (requestedUserId) {
    ownedBy = requestedUserId;
  }

  const wallets = ownedBy
    ? await db.select().from(walletsTable).where(eq(walletsTable.ownedBy, ownedBy))
    : await db.select().from(walletsTable);

  // Attach owner names
  const ownerIds = [...new Set(wallets.map(w => w.ownedBy).filter(Boolean))] as string[];
  const owners = ownerIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
    : [];
  const ownerMap = Object.fromEntries(owners.map(o => [o.id, o.name]));

  res.json({ wallets: wallets.map(w => fmt(w as Record<string, unknown>, w.ownedBy ? ownerMap[w.ownedBy] : undefined)) });
});

router.post("/wallets", async (req: Request, res): Promise<void> => {
  const user = (req as any).user as { id: string; role: string } | undefined;
  const { name, bankName, accountNumber, balance, currency, ownedBy: bodyOwnedBy } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  // Wallet owner: if MD specifies ownedBy use that, otherwise use the requesting user
  const ownedBy = user?.role === "md" && bodyOwnedBy ? bodyOwnedBy : (user?.id ?? null);

  const [wallet] = await db.insert(walletsTable).values({
    id: uid(), name, bankName, accountNumber,
    balance: String(balance ?? 0),
    currency: currency ?? "NGN",
    ownedBy,
  }).returning();

  // Get owner name
  let ownerName: string | undefined;
  if (wallet.ownedBy) {
    const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, wallet.ownedBy));
    ownerName = owner?.name;
  }

  res.status(201).json(fmt(wallet as Record<string, unknown>, ownerName));
});

router.get("/wallets/:id", async (req: Request, res): Promise<void> => {
  const user = (req as any).user as { id: string; role: string } | undefined;
  const id = req.params["id"] as string;

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, id));
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

  // Non-MD can only access their own wallet
  if (user?.role !== "md" && wallet.ownedBy && wallet.ownedBy !== user?.id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const whereClause = and(eq(billsTable.walletId, id));
  const recentTransactions = await db.select().from(billsTable)
    .where(whereClause)
    .limit(20);

  let ownerName: string | undefined;
  if (wallet.ownedBy) {
    const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, wallet.ownedBy));
    ownerName = owner?.name;
  }

  res.json({
    ...fmt(wallet as Record<string, unknown>, ownerName),
    recentTransactions: recentTransactions.map(b => ({
      ...b,
      amount: parseFloat(String(b.amount)),
      paidAmount: parseFloat(String(b.paidAmount ?? 0)),
      outstandingBalance: parseFloat(String(b.outstandingBalance ?? 0)),
    }))
  });
});

router.patch("/wallets/:id", async (req: Request, res): Promise<void> => {
  const user = (req as any).user as { id: string; role: string } | undefined;
  const id = req.params["id"] as string;
  const { balance, name, bankName, accountNumber, currency, ownedBy } = req.body;

  const [existing] = await db.select({ ownedBy: walletsTable.ownedBy }).from(walletsTable).where(eq(walletsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Wallet not found" }); return; }
  if (user?.role !== "md" && existing.ownedBy !== user?.id) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const updates: Record<string, unknown> = {};
  if (balance !== undefined) updates["balance"] = String(balance);
  if (name !== undefined) updates["name"] = name;
  if (bankName !== undefined) updates["bankName"] = bankName;
  if (accountNumber !== undefined) updates["accountNumber"] = accountNumber;
  if (currency !== undefined) updates["currency"] = currency;
  if (ownedBy !== undefined && user?.role === "md") updates["ownedBy"] = ownedBy;

  const [wallet] = await db.update(walletsTable).set(updates).where(eq(walletsTable.id, id)).returning();
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

  let ownerName: string | undefined;
  if (wallet.ownedBy) {
    const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, wallet.ownedBy));
    ownerName = owner?.name;
  }

  res.json(fmt(wallet as Record<string, unknown>, ownerName));
});

export default router;
