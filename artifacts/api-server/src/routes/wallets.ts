import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, walletsTable, billsTable, usersTable, walletTransactionsTable, auditTable } from "@workspace/db";

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

function fmtTx(tx: typeof walletTransactionsTable.$inferSelect) {
  return {
    ...tx,
    amount: parseFloat(String(tx.amount)),
    balanceBefore: parseFloat(String(tx.balanceBefore)),
    balanceAfter: parseFloat(String(tx.balanceAfter)),
  };
}

// GET /wallets — list wallets, scoped by role
router.get("/wallets", async (req, res): Promise<void> => {
  const actor = req.user!;
  const requestedUserId = req.query["userId"] as string | undefined;

  const ownedBy = actor.role !== "md"
    ? actor.id
    : requestedUserId ?? undefined;

  const wallets = ownedBy
    ? await db.select().from(walletsTable).where(eq(walletsTable.ownedBy, ownedBy))
    : await db.select().from(walletsTable);

  const ownerIds = [...new Set(wallets.map(w => w.ownedBy).filter(Boolean))] as string[];
  const owners = ownerIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
    : [];
  const ownerMap: Record<string, string> = Object.fromEntries(owners.map(o => [o.id, o.name]));

  res.json({ wallets: wallets.map(w => fmtWallet(w, w.ownedBy ? ownerMap[w.ownedBy] : undefined)) });
});

// POST /wallets — create wallet
router.post("/wallets", async (req, res): Promise<void> => {
  const actor = req.user!;
  const { name, bankName, accountNumber, balance, currency, ownedBy: bodyOwnedBy } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

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

// POST /wallets/transfer — atomic transfer between wallets
router.post("/wallets/transfer", async (req, res): Promise<void> => {
  const actor = req.user!;
  const { fromWalletId, toWalletId, amount, narration } = req.body;

  if (!fromWalletId || !toWalletId || amount === undefined || !narration) {
    res.status(400).json({ error: "fromWalletId, toWalletId, amount, and narration are required" });
    return;
  }
  if (fromWalletId === toWalletId) {
    res.status(400).json({ error: "Source and destination wallets must be different" });
    return;
  }

  const transferAmount = parseFloat(String(amount));
  if (isNaN(transferAmount) || transferAmount <= 0) {
    res.status(400).json({ error: "Amount must be a positive number" });
    return;
  }

  const [fromWallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, fromWalletId));
  const [toWallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, toWalletId));

  if (!fromWallet) { res.status(404).json({ error: "Source wallet not found" }); return; }
  if (!toWallet) { res.status(404).json({ error: "Destination wallet not found" }); return; }

  // Non-MD can only transfer from their own wallet
  if (actor.role !== "md" && fromWallet.ownedBy !== actor.id) {
    res.status(403).json({ error: "You can only transfer from your own wallet" });
    return;
  }

  const fromBalance = parseFloat(String(fromWallet.balance));
  const toBalance = parseFloat(String(toWallet.balance));

  if (fromBalance < transferAmount) {
    res.status(400).json({ error: `Insufficient balance. Available: ₦${fromBalance.toLocaleString("en-NG")}, Requested: ₦${transferAmount.toLocaleString("en-NG")}` });
    return;
  }

  const newFromBalance = fromBalance - transferAmount;
  const newToBalance = toBalance + transferAmount;

  const result = await db.transaction(async (tx) => {
    const [updatedFrom] = await tx.update(walletsTable)
      .set({ balance: String(newFromBalance) })
      .where(eq(walletsTable.id, fromWalletId))
      .returning();

    const [updatedTo] = await tx.update(walletsTable)
      .set({ balance: String(newToBalance) })
      .where(eq(walletsTable.id, toWalletId))
      .returning();

    const [debitTx] = await tx.insert(walletTransactionsTable).values({
      id: uid(),
      walletId: fromWalletId,
      type: "transfer_out",
      amount: String(transferAmount),
      balanceBefore: String(fromBalance),
      balanceAfter: String(newFromBalance),
      narration,
      initiatedBy: actor.id,
      initiatedByName: actor.name,
      relatedWalletId: toWalletId,
      relatedWalletName: toWallet.name,
    }).returning();

    const [creditTx] = await tx.insert(walletTransactionsTable).values({
      id: uid(),
      walletId: toWalletId,
      type: "transfer_in",
      amount: String(transferAmount),
      balanceBefore: String(toBalance),
      balanceAfter: String(newToBalance),
      narration,
      initiatedBy: actor.id,
      initiatedByName: actor.name,
      relatedWalletId: fromWalletId,
      relatedWalletName: fromWallet.name,
    }).returning();

    return { updatedFrom, updatedTo, debitTx, creditTx };
  });

  await db.insert(auditTable).values({
    id: uid(),
    userId: actor.id,
    userName: actor.name,
    action: "transfer",
    details: `₦${transferAmount.toLocaleString("en-NG")} from ${fromWallet.name} → ${toWallet.name}: ${narration}`,
  });

  res.json({
    from: fmtWallet(result.updatedFrom),
    to: fmtWallet(result.updatedTo),
    debitTx: fmtTx(result.debitTx),
    creditTx: fmtTx(result.creditTx),
  });
});

// GET /wallets/:id — wallet detail with recent transactions
router.get("/wallets/:id", async (req, res): Promise<void> => {
  const actor = req.user!;
  const id = req.params["id"] as string;

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, id));
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

  if (actor.role !== "md" && wallet.ownedBy !== actor.id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const recentTransactions = await db.select().from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.walletId, id))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(10);

  let ownerName: string | undefined;
  if (wallet.ownedBy) {
    const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, wallet.ownedBy));
    ownerName = owner?.name;
  }

  res.json({
    ...fmtWallet(wallet, ownerName),
    recentTransactions: recentTransactions.map(fmtTx),
  });
});

// GET /wallets/:id/statement — full paginated ledger
router.get("/wallets/:id/statement", async (req, res): Promise<void> => {
  const actor = req.user!;
  const id = req.params["id"] as string;

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, id));
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

  if (actor.role !== "md" && wallet.ownedBy !== actor.id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1")));
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query["pageSize"] ?? "50"))));
  const offset = (page - 1) * pageSize;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.walletId, id));

  const transactions = await db.select().from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.walletId, id))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(pageSize)
    .offset(offset);

  let ownerName: string | undefined;
  if (wallet.ownedBy) {
    const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, wallet.ownedBy));
    ownerName = owner?.name;
  }

  res.json({
    wallet: fmtWallet(wallet, ownerName),
    transactions: transactions.map(fmtTx),
    total: count,
    page,
    pageSize,
  });
});

// PATCH /wallets/:id — update wallet
router.patch("/wallets/:id", async (req, res): Promise<void> => {
  const actor = req.user!;
  const id = req.params["id"] as string;
  const { balance, name, bankName, accountNumber, currency, ownedBy } = req.body;

  const [existing] = await db.select({ ownedBy: walletsTable.ownedBy }).from(walletsTable).where(eq(walletsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Wallet not found" }); return; }

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
